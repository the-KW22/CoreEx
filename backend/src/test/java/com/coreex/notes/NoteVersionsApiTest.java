package com.coreex.notes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Note versions: the text a save replaced, kept so it can be read and brought back. */
class NoteVersionsApiTest extends ApiTest {

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

	private String note(String token, String title, String body) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\",\"body\":\"" + body + "\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return JSON.readTree(created.body()).path("id").asString();
	}

	private int save(String id, String token, String title, String body, int version) throws Exception {
		var saved = put("/api/notes/" + id, token,
				"{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"version\":" + version + "}");
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		return JSON.readTree(saved.body()).path("version").asInt();
	}

	private JsonNode versions(String id, String token) throws Exception {
		var list = get("/api/notes/" + id + "/versions", token);
		assertThat(list.statusCode()).as(list.body()).isEqualTo(200);
		return JSON.readTree(list.body());
	}

	private JsonNode version(String id, String versionId, String token) throws Exception {
		var one = get("/api/notes/" + id + "/versions/" + versionId, token);
		assertThat(one.statusCode()).as(one.body()).isEqualTo(200);
		return JSON.readTree(one.body());
	}

	/** Makes the kept versions look older, so the next save sees that the last one is long ago. */
	private void ageVersions(String id, int minutes) {
		jdbc.sql("update note_versions set saved_at = saved_at - make_interval(mins => :m) where item_id = :id::uuid")
				.param("m", minutes).param("id", id).update();
	}

	private void writtenByAnAgent(String id, String tokenName) {
		jdbc.sql("update items set edited_by = :name where id = :id::uuid").param("name", tokenName).param("id", id)
				.update();
	}

	@Test
	void aSaveKeepsTheTextItReplacedAndTheListShowsTheNewestFirstWithoutTheText() throws Exception {
		var id = note(userA, "Plans", "first");
		save(id, userA, "Plans", "second", 1);
		ageVersions(id, 10);
		save(id, userA, "Plans", "third", 2);

		var list = versions(id, userA);

		assertThat(list.path("total").asInt()).isEqualTo(2);
		var newest = list.path("items").get(0);
		var oldest = list.path("items").get(1);
		assertThat(newest.has("body")).as("the list carries no text").isFalse();
		assertThat(newest.path("sizeBytes").asInt()).isEqualTo("second".length());
		assertThat(newest.path("editedBy").isNull()).isTrue();
		assertThat(version(id, newest.path("id").asString(), userA).path("body").asString()).isEqualTo("second");
		assertThat(version(id, oldest.path("id").asString(), userA).path("body").asString()).isEqualTo("first");
		assertThat(get("/api/notes/" + id, userA).body()).contains("\"body\":\"third\"");
	}

	@Test
	void aUsersOwnSavesCloseTogetherKeepOneVersion() throws Exception {
		var id = note(userA, "Plans", "one");
		var version = save(id, userA, "Plans", "two", 1);
		version = save(id, userA, "Plans", "three", version);
		save(id, userA, "Plans", "four", version);

		var list = versions(id, userA);

		assertThat(list.path("total").asInt()).isEqualTo(1);
		assertThat(version(id, list.path("items").get(0).path("id").asString(), userA).path("body").asString())
				.isEqualTo("one");
	}

	@Test
	void aSaveOverTextAnAgentWroteAlwaysKeepsItAndNamesTheToken() throws Exception {
		var id = note(userA, "Plans", "one");
		var version = save(id, userA, "Plans", "two", 1);
		writtenByAnAgent(id, "claude");
		save(id, userA, "Plans", "three", version);

		var list = versions(id, userA);

		assertThat(list.path("total").asInt()).isEqualTo(2);
		var newest = list.path("items").get(0);
		assertThat(newest.path("editedBy").asString()).isEqualTo("claude");
		assertThat(version(id, newest.path("id").asString(), userA).path("body").asString()).isEqualTo("two");
	}

	@Test
	void anEmptyTextIsNotKept() throws Exception {
		var created = post("/api/notes", userA, "{\"title\":\"Empty\"}");
		var id = JSON.readTree(created.body()).path("id").asString();

		save(id, userA, "Empty", "now some text", 1);

		assertThat(versions(id, userA).path("total").asInt()).isZero();
	}

	@Test
	void restoringBringsBackTheOldTextAndKeepsWhatItReplaced() throws Exception {
		var id = note(userA, "Old title", "one");
		var version = save(id, userA, "New title", "two", 1);
		var old = versions(id, userA).path("items").get(0).path("id").asString();

		var restored = post("/api/notes/" + id + "/versions/" + old + "/restore", userA, "{\"version\":" + version + "}");

		assertThat(restored.statusCode()).as(restored.body()).isEqualTo(200);
		var note = JSON.readTree(restored.body());
		assertThat(note.path("body").asString()).isEqualTo("one");
		assertThat(note.path("title").asString()).isEqualTo("Old title");
		assertThat(note.path("version").asInt()).isEqualTo(version + 1);
		// What the restore replaced is kept even though it came right after the last version, so the restore can be undone.
		var list = versions(id, userA);
		assertThat(list.path("total").asInt()).isEqualTo(2);
		var undo = list.path("items").get(0).path("id").asString();
		assertThat(version(id, undo, userA).path("body").asString()).isEqualTo("two");
		var back = post("/api/notes/" + id + "/versions/" + undo + "/restore", userA,
				"{\"version\":" + note.path("version").asInt() + "}");
		assertThat(JSON.readTree(back.body()).path("body").asString()).isEqualTo("two");
	}

	@Test
	void restoringWithAStaleVersionIsRefusedAndChangesNothing() throws Exception {
		var id = note(userA, "Plans", "one");
		save(id, userA, "Plans", "two", 1);
		var old = versions(id, userA).path("items").get(0).path("id").asString();

		var restored = post("/api/notes/" + id + "/versions/" + old + "/restore", userA, "{\"version\":1}");

		assertThat(restored.statusCode()).isEqualTo(409);
		assertThat(restored.body()).contains("VERSION_CONFLICT");
		assertThat(get("/api/notes/" + id, userA).body()).contains("\"body\":\"two\"");
		assertThat(versions(id, userA).path("total").asInt()).isEqualTo(1);
	}

	@Test
	void versionsOlderThanNinetyDaysAndBeyondTheNewestFiftyAreRemovedWhenOneIsKept() throws Exception {
		var id = note(userA, "Plans", "one");
		jdbc.sql("""
				insert into note_versions (owner_id, item_id, title, body, saved_at)
				select i.owner_id, i.id, 'recent ' || g, 'text', now() - make_interval(hours => g)
				from items i, generate_series(1, 52) g where i.id = :id::uuid""").param("id", id).update();
		jdbc.sql("""
				insert into note_versions (owner_id, item_id, title, body, saved_at)
				select owner_id, id, 'ancient', 'text', now() - interval '100 days' from items where id = :id::uuid""")
				.param("id", id).update();
		writtenByAnAgent(id, "claude");

		save(id, userA, "Plans", "two", 1);

		var list = versions(id, userA);
		assertThat(list.path("total").asInt()).isEqualTo(50);
		assertThat(list.toString()).doesNotContain("ancient").doesNotContain("recent 52").doesNotContain("recent 51");
		assertThat(list.path("items").get(0).path("title").asString()).isEqualTo("Plans");
	}

	@Test
	void anotherUserGets404ForEveryVersionEndpointAndAVersionOfAnotherNoteIsNotFound() throws Exception {
		var id = note(userA, "Plans", "one");
		save(id, userA, "Plans", "two", 1);
		var versionId = versions(id, userA).path("items").get(0).path("id").asString();
		var bs = note(userB, "Mine", "b text");
		save(bs, userB, "Mine", "b text 2", 1);

		assertThat(get("/api/notes/" + id + "/versions", userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/notes/" + id + "/versions/" + versionId, userB).statusCode()).isEqualTo(404);
		assertThat(post("/api/notes/" + id + "/versions/" + versionId + "/restore", userB, "{\"version\":2}")
				.statusCode()).isEqualTo(404);
		// B's own Note, with A's version id.
		assertThat(get("/api/notes/" + bs + "/versions/" + versionId, userB).statusCode()).isEqualTo(404);
		assertThat(post("/api/notes/" + bs + "/versions/" + versionId + "/restore", userB, "{\"version\":2}")
				.statusCode()).isEqualTo(404);
		assertThat(get("/api/notes/" + id + "/versions/" + UUID.randomUUID(), userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/notes/" + id, userA).body()).contains("\"body\":\"two\"");
	}

	@Test
	void aNoteInTheTrashShowsNoVersions() throws Exception {
		var id = note(userA, "Plans", "one");
		save(id, userA, "Plans", "two", 1);

		delete("/api/notes/" + id, userA);

		assertThat(get("/api/notes/" + id + "/versions", userA).statusCode()).isEqualTo(404);
	}

}
