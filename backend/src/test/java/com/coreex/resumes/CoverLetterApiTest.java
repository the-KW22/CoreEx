package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.json.JsonMapper;

class CoverLetterApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	private final JsonMapper json = JsonMapper.builder().build();

	private String owner;

	private String other;

	@BeforeEach
	void users() {
		jdbc.sql("delete from users").update();
		owner = token("owner@example.com");
		other = token("other@example.com");
	}

	private String token(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	private String id(String body) {
		return json.readTree(body).get("id").asText();
	}

	@Test
	void coverLetterIsScopedAndSanitised() throws Exception {
		var made = post("/api/cover-letters", owner, "{\"title\":\"Letter\"}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		var letterId = id(made.body());
		assertThat(get("/api/cover-letters/" + letterId, other).statusCode()).isEqualTo(404);
		var saved = put("/api/cover-letters/" + letterId, owner,
				"{\"title\":\"Letter\",\"version\":1,\"document\":{\"body\":\"<p onclick='x()'>Hello<script>alert(1)</script></p>\"}}");
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		assertThat(saved.body()).contains("Hello").doesNotContain("onclick", "<script", "alert(1)");
		assertThat(put("/api/cover-letters/" + letterId, other, "{\"title\":\"Letter\",\"version\":1,\"document\":{}}")
				.statusCode()).isEqualTo(404);
	}

	@Test
	void linkedSenderFollowsResumeAndSurvivesUnlinkAndTrash() throws Exception {
		var resume = post("/api/resumes", owner, "{\"sample\":true}");
		var resumeId = id(resume.body());
		var made = post("/api/cover-letters", owner, "{\"title\":\"Letter\",\"resumeId\":\"" + resumeId + "\"}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		var letterId = id(made.body());
		assertThat(get("/api/cover-letters/" + letterId, owner).body()).contains("Alex Morgan");
		var changed = put("/api/resumes/" + resumeId, owner,
				"{\"title\":\"CV\",\"version\":1,\"document\":{\"basics\":{\"name\":\"New Name\"}}}");
		assertThat(changed.statusCode()).as(changed.body()).isEqualTo(200);
		assertThat(get("/api/cover-letters/" + letterId, owner).body()).contains("New Name");
		assertThat(get("/api/search?q=Name", owner).body()).contains(letterId);
		assertThat(get("/api/search?q=Name", other).body()).doesNotContain(letterId);
		assertThat(get("/api/cover-letters/" + letterId + "/markdown", owner).body()).contains("New Name");
		assertThat(post("/api/cover-letters/" + letterId + "/unlink", owner, "{\"version\":2}").statusCode()).isEqualTo(409);
		var unlinked = post("/api/cover-letters/" + letterId + "/unlink", owner, "{\"version\":1}");
		assertThat(unlinked.statusCode()).as(unlinked.body()).isEqualTo(200);
		assertThat(delete("/api/resumes/" + resumeId, owner).statusCode()).isEqualTo(204);
		assertThat(get("/api/cover-letters/" + letterId, owner).body()).contains("New Name");
	}

	@Test
	void deletingLinkedResumePreservesItsLastSenderAndRefusesAnotherUsersResume() throws Exception {
		var resumeId = id(post("/api/resumes", owner, "{\"sample\":true}").body());
		assertThat(post("/api/cover-letters", other,
				"{\"title\":\"Other\",\"resumeId\":\"" + resumeId + "\"}").statusCode()).isEqualTo(404);
		var letterId = id(post("/api/cover-letters", owner,
				"{\"title\":\"Letter\",\"resumeId\":\"" + resumeId + "\"}").body());
		assertThat(delete("/api/resumes/" + resumeId, owner).statusCode()).isEqualTo(204);
		assertThat(get("/api/cover-letters/" + letterId, owner).body()).contains("Alex Morgan");
	}

	@Test
	void savedLetterBodyAppearsInOwnersSearchOnly() throws Exception {
		var letterId = id(post("/api/cover-letters", owner, "{\"title\":\"Letter\"}").body());
		var saved = put("/api/cover-letters/" + letterId, owner,
				"{\"title\":\"Letter\",\"version\":1,\"document\":{\"body\":\"<p>quartzfalcon</p>\"}}");
		assertThat(saved.statusCode()).isEqualTo(200);
		assertThat(get("/api/search?q=quartzfalcon", owner).body()).contains(letterId);
		assertThat(get("/api/search?q=quartzfalcon", other).body()).doesNotContain(letterId);
	}

	@Test
	void aSavedLetterKeepsAnOwnerScopedPreviousVersion() throws Exception {
		var letterId = id(post("/api/cover-letters", owner, "{\"title\":\"Letter\"}").body());
		assertThat(put("/api/cover-letters/" + letterId, owner,
				"{\"title\":\"Letter\",\"version\":1,\"document\":{\"body\":\"<p>first draft</p>\"}}").statusCode()).isEqualTo(200);
		assertThat(put("/api/cover-letters/" + letterId, owner,
				"{\"title\":\"Letter\",\"version\":2,\"document\":{\"body\":\"<p>second draft</p>\"}}").statusCode()).isEqualTo(200);
		var versions = get("/api/cover-letters/" + letterId + "/versions", owner);
		assertThat(versions.statusCode()).as(versions.body()).isEqualTo(200);
		assertThat(get("/api/cover-letters/" + letterId + "/versions", other).statusCode()).isEqualTo(404);
		var old = json.readTree(versions.body()).get(0).get("id").asText();
		assertThat(get("/api/cover-letters/" + letterId + "/versions/" + old, owner).body()).contains("first draft");
		var restored = post("/api/cover-letters/" + letterId + "/versions/" + old + "/restore", owner, "{\"version\":3}");
		assertThat(restored.statusCode()).as(restored.body()).isEqualTo(200);
		assertThat(restored.body()).contains("first draft");
		assertThat(post("/api/cover-letters/" + letterId + "/versions", owner, "{\"name\":\"Final\"}").statusCode()).isEqualTo(201);
	}

	@Test
	void onlyOwnerCanMoveLetterToTrash() throws Exception {
		var letterId = id(post("/api/cover-letters", owner, "{\"title\":\"Letter\"}").body());
		assertThat(delete("/api/cover-letters/" + letterId, other).statusCode()).isEqualTo(404);
		assertThat(delete("/api/cover-letters/" + letterId, owner).statusCode()).isEqualTo(204);
		assertThat(get("/api/cover-letters/" + letterId, owner).statusCode()).isEqualTo(404);
	}

	@Test
	void creatingFromRecoveredContentSanitisesItAndRejectsAnotherUsersPhoto() throws Exception {
		var created = post("/api/cover-letters", owner,
				"{\"title\":\"Recovered\",\"document\":{\"body\":\"<p>Keep me<script>alert(1)</script></p>\"}}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		assertThat(created.body()).contains("Keep me").doesNotContain("<script", "alert(1)");
		var refused = post("/api/cover-letters", owner,
				"{\"title\":\"Bad\",\"document\":{\"sender\":{\"photo\":{\"assetId\":\"" + UUID.randomUUID() + "\"}}}}");
		assertThat(refused.statusCode()).as(refused.body()).isEqualTo(400);
		assertThat(jdbc.sql("select count(*) from items where title = 'Bad'").query(Long.class).single()).isZero();
	}
}
