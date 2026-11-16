package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.json.JsonMapper;

/** A Resume keeps what a save replaced, so an earlier one can be read and brought back. */
class ResumeVersionApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	private String userA;

	private String userB;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		userA = userToken("a@example.com");
		userB = userToken("b@example.com");
	}

	private String userToken(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	private static String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private String made() throws Exception {
		var created = post("/api/resumes", userA, "{}");
		assertThat(created.statusCode()).isEqualTo(201);
		return field(created.body(), "id");
	}

	/** Saves a Resume whose name is the given one, at the given counter. */
	private int save(String id, String name, int version) throws Exception {
		var body = JSON.writeValueAsString(Map.of("title", "CV", "version", version, "document", Map.of("basics", Map.of("name", name))));
		var saved = put("/api/resumes/" + id, userA, body);
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		return Integer.parseInt(field(saved.body(), "version"));
	}

	private String versions(String id) throws Exception {
		return get("/api/resumes/" + id + "/versions", userA).body();
	}

	private int count(String listBody) {
		return listBody.split("\"savedAt\"", -1).length - 1;
	}

	@Test
	void aSaveKeepsTheDocumentItReplacedButAQuickOneAfterItDoesNot() throws Exception {
		var id = made();
		var v = save(id, "One", 1);
		// The blank Resume the first save replaced is not worth keeping.
		assertThat(count(versions(id))).isZero();

		v = save(id, "Two", v);
		assertThat(count(versions(id))).isEqualTo(1);
		assertThat(versions(id)).contains("\"title\":\"CV\"").contains("\"name\":null");

		// Another save right behind it keeps nothing new: the last kept one is too close.
		save(id, "Three", v);
		assertThat(count(versions(id))).isEqualTo(1);
	}

	@Test
	void aVersionIsReadWithItsDocumentAndRestoredExactlyKeepingWhatItReplaced() throws Exception {
		var id = made();
		var v = save(id, "One", 1);
		v = save(id, "Two", v);
		var one = field(versions(id), "id");
		assertThat(get("/api/resumes/" + id + "/versions/" + one, userA).body()).contains("\"name\":\"One\"");

		var restored = post("/api/resumes/" + id + "/versions/" + one + "/restore", userA, "{\"version\":" + v + "}");

		assertThat(restored.statusCode()).as(restored.body()).isEqualTo(200);
		assertThat(restored.body()).contains("\"name\":\"One\"").contains("\"version\":" + (v + 1));
		// "Two" was replaced by the restore, so it is kept (a restore always keeps one).
		assertThat(count(versions(id))).isEqualTo(2);
		var all = versions(id);
		var keptTwo = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(all).results().map(m -> m.group(1)).filter(x -> !x.equals(one)).findFirst().orElseThrow();
		assertThat(get("/api/resumes/" + id + "/versions/" + keptTwo, userA).body()).contains("\"name\":\"Two\"");
		// A stale counter is refused like any save.
		assertThat(post("/api/resumes/" + id + "/versions/" + one + "/restore", userA, "{\"version\":1}").statusCode()).isEqualTo(409);
	}

	@Test
	void aNamedVersionIsNamedRenamedAndSurvivesTheCleanUp() throws Exception {
		var id = made();
		var v = save(id, "One", 1);

		var named = post("/api/resumes/" + id + "/versions", userA, "{\"name\":\"Sent to Acme\"}");
		assertThat(named.statusCode()).as(named.body()).isEqualTo(201);
		assertThat(named.body()).contains("\"name\":\"Sent to Acme\"");
		var namedId = field(named.body(), "id");

		// Old and too many unnamed ones are cleaned up on the next kept save; the named one is neither counted nor removed.
		for (var i = 0; i < 55; i++) {
			jdbc.sql("insert into resume_versions (owner_id, item_id, title, document, saved_at) select owner_id, item_id, 'old', document, now() - make_interval(mins => :m) from resume_versions where id = :id::uuid")
					.param("m", 10 + i).param("id", namedId).update();
		}
		jdbc.sql("update resume_versions set saved_at = saved_at - interval '200 days' where title = 'old' and saved_at < now() - interval '60 minutes'").update();
		jdbc.sql("update resume_versions set saved_at = saved_at - interval '300 days' where id = :id::uuid").param("id", namedId).update();
		save(id, "Two", v);
		var all = versions(id);
		assertThat(all).contains("\"name\":\"Sent to Acme\"");
		var unnamed = jdbc.sql("select count(*) from resume_versions where name is null and item_id = :id::uuid").param("id", id).query(Long.class).single();
		assertThat(unnamed).isLessThanOrEqualTo(50);
		assertThat(jdbc.sql("select count(*) from resume_versions where title = 'old' and saved_at < now() - interval '90 days'").query(Long.class).single()).isZero();

		var renamed = put("/api/resumes/" + id + "/versions/" + namedId + "/name", userA, "{\"name\":\"Final\"}");
		assertThat(renamed.statusCode()).isEqualTo(204);
		assertThat(versions(id)).contains("\"name\":\"Final\"").doesNotContain("Sent to Acme");
		put("/api/resumes/" + id + "/versions/" + namedId + "/name", userA, "{\"name\":\"\"}");
		assertThat(versions(id)).doesNotContain("\"name\":\"Final\"");
	}

	@Test
	void anotherUserGets404OnEveryVersionEndpoint() throws Exception {
		var id = made();
		var v = save(id, "One", 1);
		save(id, "Two", v);
		var one = field(versions(id), "id");

		assertThat(get("/api/resumes/" + id + "/versions", userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/resumes/" + id + "/versions/" + one, userB).statusCode()).isEqualTo(404);
		assertThat(post("/api/resumes/" + id + "/versions", userB, "{\"name\":\"x\"}").statusCode()).isEqualTo(404);
		assertThat(put("/api/resumes/" + id + "/versions/" + one + "/name", userB, "{\"name\":\"x\"}").statusCode()).isEqualTo(404);
		assertThat(post("/api/resumes/" + id + "/versions/" + one + "/restore", userB, "{\"version\":3}").statusCode()).isEqualTo(404);
		// A version of another Resume is not found under this one either.
		var other = made();
		assertThat(get("/api/resumes/" + other + "/versions/" + one, userA).statusCode()).isEqualTo(404);
	}

	@Test
	void aLockedResumeRefusesARestore() throws Exception {
		var id = made();
		var v = save(id, "One", 1);
		v = save(id, "Two", v);
		var one = field(versions(id), "id");
		put("/api/resumes/" + id + "/lock", userA, "{\"locked\":true}");

		var refused = post("/api/resumes/" + id + "/versions/" + one + "/restore", userA, "{\"version\":" + v + "}");

		assertThat(refused.statusCode()).isEqualTo(409);
		assertThat(refused.body()).contains("RESUME_LOCKED");
	}

	@Test
	void versionsLeaveWithTheirResumeWhenTheTrashRemovesIt() throws Exception {
		var id = made();
		var v = save(id, "One", 1);
		save(id, "Two", v);
		assertThat(count(versions(id))).isEqualTo(1);

		jdbc.sql("delete from items where id = :id::uuid").param("id", id).update();

		assertThat(jdbc.sql("select count(*) from resume_versions").query(Long.class).single()).isZero();
	}

}
