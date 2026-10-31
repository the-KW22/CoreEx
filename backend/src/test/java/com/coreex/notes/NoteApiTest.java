package com.coreex.notes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class NoteApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	DataSource dataSource;

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

	private String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private String createNote(String token, String json) throws Exception {
		var created = post("/api/notes", token, json);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return created.body();
	}

	private String save(String id, String token, String title, String body, int version) throws Exception {
		return put("/api/notes/" + id, token, "{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"version\":"
				+ version + "}").body();
	}

	@Test
	void theItemListCarriesAPlainTextSnippetOfEachNote() throws Exception {
		createNote(userA, "{\"title\":\"Plans\",\"body\":\"# Plans\\n\\nShip **it** soon\"}");
		createNote(userA, "{\"title\":\"Empty\"}");

		var list = get("/api/items", userA).body();

		assertThat(list).contains("\"title\":\"Plans\"").contains("\"snippet\":\"Ship it soon\"")
				.contains("\"snippet\":null");
	}

	@Test
	void userCreatesReadsSavesAndListsNotesByLastUpdated() throws Exception {
		var first = createNote(userA, "{\"title\":\"First\",\"body\":\"# One\"}");
		createNote(userA, "{\"title\":\"Second\"}");
		assertThat(field(first, "version")).isEqualTo("1");

		var saved = put("/api/notes/" + field(first, "id"), userA,
				"{\"title\":\"First, renamed\",\"body\":\"# One\\n\\nmore\",\"version\":1}");
		assertThat(saved.statusCode()).isEqualTo(200);
		assertThat(field(saved.body(), "version")).isEqualTo("2");

		var read = get("/api/notes/" + field(first, "id"), userA);
		assertThat(read.statusCode()).isEqualTo(200);
		assertThat(read.body()).contains("\"title\":\"First, renamed\"").contains("\"body\":\"# One\\n\\nmore\"");

		var list = get("/api/items", userA);
		assertThat(list.statusCode()).isEqualTo(200);
		assertThat(list.body()).contains("\"total\":2").contains("\"type\":\"NOTE\"");
		assertThat(list.body().indexOf("First, renamed")).isLessThan(list.body().indexOf("Second"));
	}

	@Test
	void markdownIsStoredExactlyAsWritten() throws Exception {
		var note = createNote(userA, "{}");
		var body = "# Title  \\r\\n- [ ] task\\t\\n\\n```java\\nint x = 1;\\n```\\n\\n\\u00e9\\u4e2d\\ud83d\\ude00   ";

		save(field(note, "id"), userA, "t", body, 1);

		var stored = jdbc.sql("select body from note_contents where item_id = :id")
				.param("id", UUID.fromString(field(note, "id"))).query(String.class).single();
		assertThat(stored).isEqualTo("# Title  \r\n- [ ] task\t\n\n```java\nint x = 1;\n```\n\né中😀   ");
	}

	@Test
	void anUntitledNoteIsAllowed() throws Exception {
		var note = createNote(userA, "{}");

		assertThat(note).contains("\"title\":\"\"").contains("\"body\":\"\"");
		assertThat(get("/api/items", userA).body()).contains("\"total\":1");
	}

	@Test
	void aStaleVersionGets409AndLeavesTheContentAlone() throws Exception {
		var id = field(createNote(userA, "{\"body\":\"original\"}"), "id");
		assertThat(put("/api/notes/" + id, userA, "{\"title\":\"\",\"body\":\"other tab\",\"version\":1}")
				.statusCode()).isEqualTo(200);

		var stale = put("/api/notes/" + id, userA, "{\"title\":\"\",\"body\":\"mine\",\"version\":1}");

		assertThat(stale.statusCode()).isEqualTo(409);
		assertThat(stale.body()).contains("\"code\":\"VERSION_CONFLICT\"");
		var current = get("/api/notes/" + id, userA).body();
		assertThat(current).contains("\"body\":\"other tab\"").contains("\"version\":2");
	}

	@Test
	void deletedNotesDisappearEverywhere() throws Exception {
		var id = field(createNote(userA, "{\"title\":\"Gone\"}"), "id");

		assertThat(delete("/api/notes/" + id, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/notes/" + id, userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/items", userA).body()).contains("\"total\":0").doesNotContain("Gone");
		assertThat(put("/api/notes/" + id, userA, "{\"title\":\"\",\"body\":\"\",\"version\":1}").statusCode())
				.isEqualTo(404);
		assertThat(delete("/api/notes/" + id, userA).statusCode()).isEqualTo(404);
		var deleted = jdbc.sql("select deleted_at is not null and trash_batch_id is not null from items where id = :id")
				.param("id", UUID.fromString(id)).query(Boolean.class).single();
		assertThat(deleted).isTrue();
	}

	@Test
	void userBGets404ForUserAsNote() throws Exception {
		var id = field(createNote(userA, "{\"title\":\"Private\",\"body\":\"secret\"}"), "id");

		assertThat(get("/api/notes/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(put("/api/notes/" + id, userB, "{\"title\":\"x\",\"body\":\"x\",\"version\":1}").statusCode())
				.isEqualTo(404);
		assertThat(delete("/api/notes/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/items", userB).body()).contains("\"total\":0").doesNotContain("Private");
		assertThat(get("/api/notes/" + id, userA).body()).contains("secret").contains("\"version\":1");
	}

	@Test
	void invalidRequestsGet400() throws Exception {
		var id = field(createNote(userA, "{}"), "id");

		assertThat(post("/api/notes", userA, "{\"title\":\"" + "x".repeat(201) + "\"}").statusCode()).isEqualTo(400);
		assertThat(put("/api/notes/" + id, userA, "{\"title\":\"\",\"body\":\"\"}").statusCode()).isEqualTo(400);
		assertThat(get("/api/notes/not-a-uuid", userA).statusCode()).isEqualTo(400);
		// Postgres cannot store a NUL character.
		assertThat(post("/api/notes", userA, "{\"body\":\"a\u0000b\"}").statusCode()).isEqualTo(400);
		assertThat(put("/api/notes/" + id, userA, "{\"title\":\"a\u0000\",\"body\":\"\",\"version\":1}").statusCode())
				.isEqualTo(400);
	}

	@Test
	void notesNeedASignedInUser() throws Exception {
		assertThat(get("/api/items").statusCode()).isEqualTo(401);
		assertThat(post("/api/notes", null, "{}").statusCode()).isEqualTo(401);
	}

	@Test
	void aNoteCannotBeCreatedInAFolderThatIsBeingDeletedAtThatMoment() throws Exception {
		var folder = post("/api/folders", userA, "{\"name\":\"Doomed\"}");
		var folderId = folder.body().replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
		try (var deleter = dataSource.getConnection()) {
			deleter.setAutoCommit(false);
			// The Folder's deletion is under way but not committed yet.
			try (var update = deleter.prepareStatement("update folders set deleted_at = now() where id = ?::uuid")) {
				update.setString(1, folderId);
				update.executeUpdate();
			}
			var create = CompletableFuture.supplyAsync(() -> {
				try {
					return post("/api/notes", userA, "{\"title\":\"Late\",\"folderId\":\"" + folderId + "\"}");
				}
				catch (Exception e) {
					throw new IllegalStateException(e);
				}
			});
			// The request must wait for the deletion to finish instead of racing past it.
			Thread.sleep(500);
			assertThat(create).isNotDone();
			deleter.commit();

			assertThat(create.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(404);
		}
		assertThat(jdbc.sql("select count(*) from items where title = 'Late'").query(Long.class).single()).isZero();
	}

}
