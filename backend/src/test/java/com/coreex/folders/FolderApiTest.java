package com.coreex.folders;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class FolderApiTest extends ApiTest {

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

	private String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	/** Creates a Folder (parent may be null) and returns its id. */
	private String folder(String token, String name, String parentId) throws Exception {
		var parent = parentId == null ? "null" : "\"" + parentId + "\"";
		var created = post("/api/folders", token, "{\"name\":\"" + name + "\",\"parentId\":" + parent + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	/** Creates a Note (folder may be null) and returns its id. */
	private String note(String token, String title, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\",\"folderId\":" + folder + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private int move(String path, String token, String key, String value) throws Exception {
		return post(path, token, "{\"" + key + "\":" + (value == null ? "null" : "\"" + value + "\"") + "}")
				.statusCode();
	}

	@Test
	void foldersNestToAnyDepthAndCanBeRenamed() throws Exception {
		var work = folder(userA, "Work", null);
		var coreex = folder(userA, "CoreEx", work);
		var research = folder(userA, "Research", coreex);

		var list = get("/api/folders", userA);
		assertThat(list.statusCode()).isEqualTo(200);
		assertThat(list.body()).contains("\"total\":3").contains("\"parentId\":\"" + coreex + "\"")
				.contains("\"parentId\":null");

		var renamed = put("/api/folders/" + research, userA, "{\"name\":\"Papers\"}");
		assertThat(renamed.statusCode()).isEqualTo(200);
		assertThat(renamed.body()).contains("\"name\":\"Papers\"").contains("\"parentId\":\"" + coreex + "\"");
	}

	@Test
	void aFolderCanMoveIntoAnotherAndBackToTheTopLevel() throws Exception {
		var a = folder(userA, "A", null);
		var b = folder(userA, "B", null);

		assertThat(move("/api/folders/" + b + "/move", userA, "parentId", a)).isEqualTo(200);
		assertThat(get("/api/folders", userA).body()).contains("\"parentId\":\"" + a + "\"");

		assertThat(move("/api/folders/" + b + "/move", userA, "parentId", null)).isEqualTo(200);
		assertThat(get("/api/folders", userA).body()).doesNotContain("\"parentId\":\"" + a + "\"");
	}

	@Test
	void movingAFolderIntoItselfOrItsSubtreeIsRefused() throws Exception {
		var a = folder(userA, "A", null);
		var b = folder(userA, "B", a);
		var c = folder(userA, "C", b);

		var intoItself = post("/api/folders/" + a + "/move", userA, "{\"parentId\":\"" + a + "\"}");
		var intoChild = post("/api/folders/" + a + "/move", userA, "{\"parentId\":\"" + b + "\"}");
		var intoGrandchild = post("/api/folders/" + a + "/move", userA, "{\"parentId\":\"" + c + "\"}");

		for (var refused : List.of(intoItself, intoChild, intoGrandchild)) {
			assertThat(refused.statusCode()).isEqualTo(409);
			assertThat(refused.body()).contains("\"code\":\"FOLDER_CYCLE\"");
		}
		// Nothing moved.
		assertThat(get("/api/folders", userA).body()).contains("\"id\":\"" + a + "\",\"parentId\":null");
	}

	@Test
	void anItemIsInOneFolderAtATimeAndCanReturnToTheTopLevel() throws Exception {
		var a = folder(userA, "A", null);
		var b = folder(userA, "B", null);
		var inA = note(userA, "In A", a);

		assertThat(get("/api/items?folderId=" + a, userA).body()).contains("In A").contains("\"total\":1");

		var moved = post("/api/items/" + inA + "/move", userA, "{\"folderId\":\"" + b + "\"}");
		assertThat(moved.statusCode()).isEqualTo(200);
		assertThat(moved.body()).contains("\"folderId\":\"" + b + "\"");
		assertThat(get("/api/items?folderId=" + a, userA).body()).contains("\"total\":0");
		assertThat(get("/api/items?folderId=" + b, userA).body()).contains("In A");

		var top = post("/api/items/" + inA + "/move", userA, "{\"folderId\":null}");
		assertThat(top.body()).contains("\"folderId\":null");
		assertThat(get("/api/items?folderId=" + b, userA).body()).contains("\"total\":0");
		assertThat(get("/api/items", userA).body()).contains("In A");
	}

	@Test
	void theFolderListCountsLiveItemsDirectlyInEachFolder() throws Exception {
		var a = folder(userA, "A", null);
		var inner = folder(userA, "Inner", a);
		var empty = folder(userA, "Empty", null);
		note(userA, "One", a);
		note(userA, "Two", a);
		note(userA, "Deep", inner);
		var gone = note(userA, "Gone", a);
		assertThat(delete("/api/notes/" + gone, userA).statusCode()).isEqualTo(204);
		var other = folder(userB, "B's", null);
		note(userB, "Not mine", other);

		var listed = get("/api/folders", userA).body();

		assertThat(listed).contains("\"id\":\"" + a + "\",\"parentId\":null,\"name\":\"A\",\"itemCount\":2")
				.contains("\"id\":\"" + inner + "\",\"parentId\":\"" + a + "\",\"name\":\"Inner\",\"itemCount\":1")
				.contains("\"id\":\"" + empty + "\",\"parentId\":null,\"name\":\"Empty\",\"itemCount\":0");
		assertThat(get("/api/folders", userB).body()).contains("\"name\":\"B's\",\"itemCount\":1");
	}

	@Test
	void folderListingsShowOnlyLiveItems() throws Exception {
		var a = folder(userA, "A", null);
		var kept = note(userA, "Kept", a);
		var gone = note(userA, "Gone", a);
		assertThat(delete("/api/notes/" + gone, userA).statusCode()).isEqualTo(204);

		var listed = get("/api/items?folderId=" + a, userA).body();

		assertThat(listed).contains("\"total\":1").contains(kept).doesNotContain("Gone");
	}

	@Test
	void deletingAFolderHidesTheWholeSubtreeUnderOneTrashBatch() throws Exception {
		var a = folder(userA, "A", null);
		var b = folder(userA, "B", a);
		var other = folder(userA, "Other", null);
		var inA = note(userA, "In A", a);
		var inB1 = note(userA, "In B 1", b);
		var inB2 = note(userA, "In B 2", b);
		var earlier = note(userA, "Earlier", b);
		var outside = note(userA, "Outside", other);
		delete("/api/notes/" + earlier, userA);
		var earlierBatch = batchOf("items", earlier);

		var summary = get("/api/folders/" + a + "/summary", userA);
		assertThat(summary.statusCode()).isEqualTo(200);
		assertThat(field(summary.body(), "folderCount")).isEqualTo("1");
		assertThat(field(summary.body(), "itemCount")).isEqualTo("3");

		assertThat(delete("/api/folders/" + a, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/folders", userA).body()).contains("\"total\":1").contains(other);
		assertThat(get("/api/items", userA).body()).contains("\"total\":1").contains(outside);
		for (var id : new String[] { inA, inB1, inB2 }) {
			assertThat(get("/api/notes/" + id, userA).statusCode()).isEqualTo(404);
		}
		var batches = jdbc.sql("""
				select distinct trash_batch_id from (
				  select trash_batch_id from folders where id in (:a, :b)
				  union all select trash_batch_id from items where id in (:i1, :i2, :i3)) t""")
				.param("a", UUID.fromString(a)).param("b", UUID.fromString(b)).param("i1", UUID.fromString(inA))
				.param("i2", UUID.fromString(inB1)).param("i3", UUID.fromString(inB2)).query(UUID.class).list();
		assertThat(batches).hasSize(1).doesNotContainNull().doesNotContain(earlierBatch);
		assertThat(batchOf("items", earlier)).isEqualTo(earlierBatch);
	}

	@Test
	void aDeletedFolderCannotBeUsedAnymore() throws Exception {
		var a = folder(userA, "A", null);
		var live = folder(userA, "Live", null);
		var n = note(userA, "Note", null);
		delete("/api/folders/" + a, userA);

		assertThat(put("/api/folders/" + a, userA, "{\"name\":\"x\"}").statusCode()).isEqualTo(404);
		assertThat(move("/api/folders/" + a + "/move", userA, "parentId", null)).isEqualTo(404);
		assertThat(move("/api/folders/" + live + "/move", userA, "parentId", a)).isEqualTo(404);
		assertThat(move("/api/items/" + n + "/move", userA, "folderId", a)).isEqualTo(404);
		assertThat(post("/api/notes", userA, "{\"folderId\":\"" + a + "\"}").statusCode()).isEqualTo(404);
		assertThat(delete("/api/folders/" + a, userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/folders/" + a + "/summary", userA).statusCode()).isEqualTo(404);
	}

	@Test
	void userBGets404ForUserAsFolders() throws Exception {
		var a = folder(userA, "Private", null);
		var inA = note(userA, "Secret", a);
		var bFolder = folder(userB, "Mine", null);
		var bNote = note(userB, "Mine too", null);

		assertThat(put("/api/folders/" + a, userB, "{\"name\":\"x\"}").statusCode()).isEqualTo(404);
		assertThat(move("/api/folders/" + a + "/move", userB, "parentId", null)).isEqualTo(404);
		assertThat(get("/api/folders/" + a + "/summary", userB).statusCode()).isEqualTo(404);
		assertThat(delete("/api/folders/" + a, userB).statusCode()).isEqualTo(404);
		// B cannot put anything into A's Folder, or A's Item anywhere.
		assertThat(move("/api/folders/" + bFolder + "/move", userB, "parentId", a)).isEqualTo(404);
		assertThat(move("/api/items/" + bNote + "/move", userB, "folderId", a)).isEqualTo(404);
		assertThat(post("/api/notes", userB, "{\"folderId\":\"" + a + "\"}").statusCode()).isEqualTo(404);
		assertThat(post("/api/folders", userB, "{\"name\":\"x\",\"parentId\":\"" + a + "\"}").statusCode())
				.isEqualTo(404);
		assertThat(move("/api/items/" + inA + "/move", userB, "folderId", null)).isEqualTo(404);
		assertThat(get("/api/folders", userB).body()).contains("\"total\":1").doesNotContain("Private");
		assertThat(get("/api/items?folderId=" + a, userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/items", userB).body()).doesNotContain("Secret");
		// A's data is untouched.
		assertThat(get("/api/items?folderId=" + a, userA).body()).contains("Secret");
		assertThat(get("/api/folders", userA).body()).contains("Private");
	}

	@Test
	void invalidRequestsGet400() throws Exception {
		assertThat(post("/api/folders", userA, "{\"name\":\"   \"}").statusCode()).isEqualTo(400);
		assertThat(post("/api/folders", userA, "{}").statusCode()).isEqualTo(400);
		assertThat(post("/api/folders", userA, "{\"name\":\"" + "x".repeat(201) + "\"}").statusCode())
				.isEqualTo(400);
		var a = folder(userA, "A", null);
		assertThat(put("/api/folders/" + a, userA, "{\"name\":\"\"}").statusCode()).isEqualTo(400);
	}

	@Test
	void foldersNeedASignedInUser() throws Exception {
		assertThat(get("/api/folders").statusCode()).isEqualTo(401);
	}

	private UUID batchOf(String table, String id) {
		return jdbc.sql("select trash_batch_id from " + table + " where id = :id").param("id", UUID.fromString(id))
				.query(UUID.class).single();
	}

}
