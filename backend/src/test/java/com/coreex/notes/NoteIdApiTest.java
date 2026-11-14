package com.coreex.notes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Creating a Note with a client-made id: a repeated request returns the Note instead of making a second one. */
class NoteIdApiTest extends ApiTest {

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

	private JsonNode create(String token, String json, int status) throws Exception {
		var created = post("/api/notes", token, json);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(status);
		return JSON.readTree(created.body());
	}

	private int notes() {
		return jdbc.sql("select count(*) from items where type = 'NOTE'").query(Integer.class).single();
	}

	@Test
	void theSameCreateWithTheSameIdMakesOneNoteAndBothCallsReturnIt() throws Exception {
		var id = UUID.randomUUID().toString();

		var first = create(userA, "{\"id\":\"" + id + "\",\"title\":\"First\",\"body\":\"one\"}", 201);
		var again = create(userA, "{\"id\":\"" + id + "\",\"title\":\"Second\",\"body\":\"two\"}", 201);

		assertThat(first.path("id").asString()).isEqualTo(id);
		assertThat(again.path("id").asString()).isEqualTo(id);
		// The repeat changes nothing: it is the stored Note, not the second request's text.
		assertThat(again.path("title").asString()).isEqualTo("First");
		assertThat(again.path("body").asString()).isEqualTo("one");
		assertThat(again.path("version").asInt()).isEqualTo(first.path("version").asInt());
		assertThat(notes()).isEqualTo(1);
	}

	@Test
	void aCreateWithoutAnIdStillMakesANewNoteEachTime() throws Exception {
		var first = create(userA, "{\"title\":\"Same\"}", 201);
		var second = create(userA, "{\"title\":\"Same\"}", 201);

		assertThat(first.path("id").asString()).isNotEqualTo(second.path("id").asString());
		assertThat(notes()).isEqualTo(2);
	}

	@Test
	void aRepeatedCreateStillReturnsTheNoteWhenItsFolderIsGoneNow() throws Exception {
		var folder = JSON.readTree(post("/api/folders", userA, "{\"name\":\"Inbox\"}").body()).path("id").asString();
		var id = UUID.randomUUID().toString();
		create(userA, "{\"id\":\"" + id + "\",\"title\":\"In a folder\",\"folderId\":\"" + folder + "\"}", 201);
		// The Note moves out (a Folder in the Trash takes its Notes with it), then the Folder goes.
		jdbc.sql("update items set folder_id = null where id = :id::uuid").param("id", id).update();
		assertThat(delete("/api/folders/" + folder, userA).statusCode()).isEqualTo(204);

		var again = create(userA, "{\"id\":\"" + id + "\",\"title\":\"In a folder\",\"folderId\":\"" + folder + "\"}", 201);

		assertThat(again.path("id").asString()).isEqualTo(id);
		assertThat(notes()).isEqualTo(1);
	}

	@Test
	void anIdOfAnotherUsersNoteAnAssetOrATrashedNoteIsRefusedTheSameWayAndNothingChanges() throws Exception {
		var others = UUID.randomUUID().toString();
		create(userA, "{\"id\":\"" + others + "\",\"title\":\"A's\",\"body\":\"secret\"}", 201);
		var asset = UUID.randomUUID();
		jdbc.sql("insert into items (id, owner_id, type, title) select :id, id, 'ASSET', 'B asset' from users where email = 'b@example.com'")
				.param("id", asset).update();
		var trashed = UUID.randomUUID().toString();
		create(userB, "{\"id\":\"" + trashed + "\",\"title\":\"B trashed\"}", 201);
		assertThat(delete("/api/notes/" + trashed, userB).statusCode()).isEqualTo(204);
		var before = notes();

		var anotherUsers = create(userB, "{\"id\":\"" + others + "\",\"title\":\"Mine now\"}", 400);
		var anAsset = create(userB, "{\"id\":\"" + asset + "\",\"title\":\"Mine now\"}", 400);
		var aTrashed = create(userB, "{\"id\":\"" + trashed + "\",\"title\":\"Mine now\"}", 400);

		assertThat(anotherUsers.path("code").asString()).isEqualTo("INVALID_REQUEST");
		// The answer does not say which of the three it was.
		assertThat(anAsset).isEqualTo(anotherUsers);
		assertThat(aTrashed).isEqualTo(anotherUsers);
		assertThat(notes()).isEqualTo(before);
		assertThat(get("/api/notes/" + others, userA).body()).contains("\"title\":\"A's\"").contains("secret");
	}

	@Test
	void twoRequestsAtOnceWithTheSameIdMakeOneNote() throws Exception {
		var id = UUID.randomUUID().toString();
		var json = "{\"id\":\"" + id + "\",\"title\":\"Racing\"}";

		var first = CompletableFuture.supplyAsync(() -> send(json));
		var second = CompletableFuture.supplyAsync(() -> send(json));

		assertThat(first.get(30, TimeUnit.SECONDS)).isEqualTo(201);
		assertThat(second.get(30, TimeUnit.SECONDS)).isEqualTo(201);
		assertThat(notes()).isEqualTo(1);
	}

	private int send(String json) {
		try {
			return post("/api/notes", userA, json).statusCode();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	@Test
	void anIdThatIsNotAUuidIsInvalid() throws Exception {
		create(userA, "{\"id\":\"not-a-uuid\",\"title\":\"x\"}", 400);
	}

}
