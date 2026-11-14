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

/** The light check an open editor makes to learn whether its Note changed elsewhere: version, time, who. */
class NoteLatestApiTest extends ApiTest {

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

	private String note(String token, String body) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"Plans\",\"body\":" + JSON.writeValueAsString(body) + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return JSON.readTree(created.body()).path("id").asString();
	}

	private JsonNode latest(String id, String token) throws Exception {
		var response = get("/api/notes/" + id + "/latest", token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return JSON.readTree(response.body());
	}

	@Test
	void latestGivesTheVersionTimeAndWhoWroteItAndFollowsEachSave() throws Exception {
		var id = note(userA, "first");

		var created = latest(id, userA);
		assertThat(created.path("version").asInt()).isEqualTo(1);
		assertThat(created.path("updatedAt").asString()).isNotBlank();
		assertThat(created.path("editedBy").isNull()).isTrue();

		assertThat(put("/api/notes/" + id, userA, "{\"title\":\"Plans\",\"body\":\"second\",\"version\":1}").statusCode())
				.isEqualTo(200);
		assertThat(latest(id, userA).path("version").asInt()).isEqualTo(2);
	}

	@Test
	void latestNamesTheAccessTokenThatMadeTheLatestChangeUntilTheUserSavesAgain() throws Exception {
		var id = note(userA, "first");
		jdbc.sql("update items set edited_by = 'claude' where id = :id::uuid").param("id", id).update();

		assertThat(latest(id, userA).path("editedBy").asString()).isEqualTo("claude");

		put("/api/notes/" + id, userA, "{\"title\":\"Plans\",\"body\":\"mine\",\"version\":1}");
		assertThat(latest(id, userA).path("editedBy").isNull()).isTrue();
	}

	@Test
	void latestCarriesNoText() throws Exception {
		var id = note(userA, "a very private body");

		assertThat(get("/api/notes/" + id + "/latest", userA).body()).doesNotContain("private").doesNotContain("body");
	}

	@Test
	void latestIs404ForAnotherUsersNoteAnUnknownIdAndANoteInTheTrash() throws Exception {
		var id = note(userA, "first");
		var trashed = note(userA, "gone");
		assertThat(delete("/api/notes/" + trashed, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/notes/" + id + "/latest", userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/notes/" + UUID.randomUUID() + "/latest", userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/notes/" + trashed + "/latest", userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/notes/" + id + "/latest", null).statusCode()).isEqualTo(401);
	}

}
