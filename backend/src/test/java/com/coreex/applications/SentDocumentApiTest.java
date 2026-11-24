package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import tools.jackson.databind.json.JsonMapper;

class SentDocumentApiTest extends ApiTest {

	@Autowired JdbcClient jdbc;
	private final JsonMapper json = JsonMapper.builder().build();
	private String owner, other, application, resume, letter;

	private String token(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	private String id(String body) { return json.readTree(body).get("id").asText(); }

	@BeforeEach
	void prepare() throws Exception {
		jdbc.sql("delete from users").update();
		owner = token("a@example.com"); other = token("b@example.com");
		application = id(post("/api/applications", owner, "{\"company\":\"Example\",\"role\":\"Engineer\"}").body());
		resume = id(post("/api/resumes", owner, "{\"sample\":true}").body());
		letter = id(post("/api/cover-letters", owner, "{\"title\":\"Letter\"}").body());
	}

	@Test
	void appliedKeepsExactDocumentsAndCannotSwapThem() throws Exception {
		for (var link : new String[] { "{\"kind\":\"RESUME\",\"itemId\":\"" + resume + "\"}", "{\"kind\":\"COVER_LETTER\",\"itemId\":\"" + letter + "\"}" }) {
			var result = put("/api/applications/" + application + "/linked-documents", owner, link);
			assertThat(result.statusCode()).as(result.body()).isEqualTo(200);
		}
		assertThat(get("/api/items/" + resume + "/linked-applications", owner).body()).contains(application);
		assertThat(get("/api/items/" + resume + "/linked-applications", other).statusCode()).isEqualTo(404);
		assertThat(get("/api/career/documents-by-application", owner).body()).contains(application, resume, letter);
		assertThat(get("/api/career/documents-by-application", other).body()).doesNotContain(application, resume, letter);
		assertThat(get("/api/applications/" + application + "/linked-documents", other).statusCode()).isEqualTo(404);
		var applied = post("/api/applications/" + application + "/stage", owner, "{\"stage\":\"APPLIED\",\"version\":1}");
		assertThat(applied.statusCode()).as(applied.body()).isEqualTo(200);
		var sent = get("/api/applications/" + application + "/linked-documents", owner).body();
		assertThat(sent).contains("Alex Morgan", "\"sentAt\"", "\"checkScore\"");
		assertThat(put("/api/resumes/" + resume, owner,
				"{\"title\":\"Updated\",\"version\":1,\"document\":{\"basics\":{\"name\":\"Changed later\"}}}").statusCode()).isEqualTo(200);
		assertThat(get("/api/applications/" + application + "/linked-documents", owner).body()).contains("Alex Morgan").doesNotContain("Changed later");
		var another = id(post("/api/resumes", owner, "{}").body());
		assertThat(put("/api/applications/" + application + "/linked-documents", owner,
				"{\"kind\":\"RESUME\",\"itemId\":\"" + another + "\"}").statusCode()).isEqualTo(409);
	}

	@Test
	void linkingAfterAppliedSnapshotsTheNewDocument() throws Exception {
		assertThat(post("/api/applications/" + application + "/stage", owner, "{\"stage\":\"APPLIED\",\"version\":1}").statusCode()).isEqualTo(200);
		var result = put("/api/applications/" + application + "/linked-documents", owner,
				"{\"kind\":\"RESUME\",\"itemId\":\"" + resume + "\"}");
		assertThat(result.statusCode()).as(result.body()).isEqualTo(200);
		assertThat(result.body()).contains("Alex Morgan", "\"checkScore\":100");
	}

	@Test
	void aCvCannotBeLinkedToAnApplicationButAResumeCan() throws Exception {
		var cv = id(post("/api/resumes", owner, "{\"title\":\"Master\",\"kind\":\"CV\"}").body());
		var refused = put("/api/applications/" + application + "/linked-documents", owner,
				"{\"kind\":\"RESUME\",\"itemId\":\"" + cv + "\"}");
		assertThat(refused.statusCode()).as(refused.body()).isEqualTo(400);
		assertThat(refused.body()).contains("INVALID_REQUEST", "A CV cannot be linked to an Application. Make a Resume from it first.");
		assertThat(get("/api/applications/" + application + "/linked-documents", owner).body()).doesNotContain(cv);
		assertThat(put("/api/applications/" + application + "/linked-documents", owner,
				"{\"kind\":\"RESUME\",\"itemId\":\"" + resume + "\"}").statusCode()).isEqualTo(200);
	}

	@Test
	void replacingAnUnsentLinkRequiresAnExplicitChoice() throws Exception {
		var first = "{\"kind\":\"RESUME\",\"itemId\":\"" + resume + "\"}";
		assertThat(put("/api/applications/" + application + "/linked-documents", owner, first).statusCode()).isEqualTo(200);
		var another = id(post("/api/resumes", owner, "{}").body());
		var second = "{\"kind\":\"RESUME\",\"itemId\":\"" + another + "\"}";
		assertThat(put("/api/applications/" + application + "/linked-documents", owner, second).statusCode()).isEqualTo(409);
		assertThat(put("/api/applications/" + application + "/linked-documents", owner,
				"{\"kind\":\"RESUME\",\"itemId\":\"" + another + "\",\"replaceExisting\":true}").statusCode()).isEqualTo(200);
	}

	@Test
	void copyingForAJobIsIdempotentAndScoped() throws Exception {
		var request = "{\"resumeId\":\"" + resume + "\",\"requestId\":\"" + UUID.randomUUID() + "\"}";
		var first = post("/api/applications/" + application + "/copy-resume", owner, request);
		var second = post("/api/applications/" + application + "/copy-resume", owner, request);
		assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
		assertThat(second.statusCode()).as(second.body()).isEqualTo(200);
		assertThat(id(first.body())).isEqualTo(id(second.body())).isNotEqualTo(resume);
		assertThat(post("/api/applications/" + application + "/copy-resume", other, request).statusCode()).isEqualTo(404);
	}

	@Test
	void concurrentRetriesMakeOnlyOneCopy() throws Exception {
		var request = "{\"resumeId\":\"" + resume + "\",\"requestId\":\"" + UUID.randomUUID() + "\"}";
		var start = new java.util.concurrent.CountDownLatch(1);
		var tasks = java.util.stream.IntStream.range(0, 2).mapToObj(n -> java.util.concurrent.CompletableFuture.supplyAsync(() -> {
			try { start.await(); return post("/api/applications/" + application + "/copy-resume", owner, request); }
			catch (Exception e) { throw new java.util.concurrent.CompletionException(e); }
		})).toList();
		start.countDown();
		var first = tasks.get(0).get();
		var second = tasks.get(1).get();
		assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
		assertThat(second.statusCode()).as(second.body()).isEqualTo(200);
		assertThat(id(first.body())).isEqualTo(id(second.body()));
		assertThat(jdbc.sql("select count(*) from application_resume_copies").query(Long.class).single()).isEqualTo(1);
	}
}
