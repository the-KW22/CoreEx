package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

/** An Application is an Item: it sits in a Folder, takes Tags, and goes to the Trash and back like a Note or an Asset. */
class ApplicationItemApiTest extends ApiTest {

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

	private String made(String token, String company) throws Exception {
		var created = post("/api/applications", token, "{\"company\":\"" + company + "\",\"role\":\"Engineer\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String folder(String token, String name) throws Exception {
		var created = post("/api/folders", token, "{\"name\":\"" + name + "\",\"parentId\":null}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	@Test
	void anApplicationMovesIntoAFolderAndTheFolderListsIt() throws Exception {
		var id = made(userA, "Acme");
		var folder = folder(userA, "Jobs");

		var moved = post("/api/items/" + id + "/move", userA, "{\"folderId\":\"" + folder + "\"}");
		assertThat(moved.statusCode()).as(moved.body()).isEqualTo(200);

		assertThat(field(get("/api/applications/" + id, userA).body(), "folderId")).isEqualTo(folder);
		var listed = get("/api/items?folderId=" + folder, userA).body();
		assertThat(listed).contains("\"id\":\"" + id + "\"").contains("\"type\":\"APPLICATION\"");
		// Not another User's Folder, and not another User's Application.
		assertThat(post("/api/items/" + id + "/move", userB, "{\"folderId\":null}").statusCode()).isEqualTo(404);
		assertThat(post("/api/items/" + id + "/move", userA, "{\"folderId\":\"" + folder(userB, "Theirs") + "\"}").statusCode())
				.isEqualTo(404);
	}

	@Test
	void anApplicationTakesTagsAndIsFoundByThem() throws Exception {
		var id = made(userA, "Acme");

		var tagged = post("/api/items/" + id + "/tags", userA, "{\"name\":\"remote\"}");
		assertThat(tagged.statusCode()).as(tagged.body()).isIn(200, 201);
		var tagId = field(get("/api/items/" + id + "/tags", userA).body(), "id");

		assertThat(get("/api/items?tagId=" + tagId, userA).body()).contains("\"id\":\"" + id + "\"");
		// The Applications list carries each one's Tags, by Application id, for the chips on its rows.
		assertThat(get("/api/applications", userA).body()).contains("\"tags\":{\"" + id + "\":[{\"id\":\"" + tagId + "\",\"name\":\"remote\"");
		assertThat(get("/api/applications", userB).body()).doesNotContain("remote");
		assertThat(post("/api/items/" + id + "/tags", userB, "{\"name\":\"remote\"}").statusCode()).isEqualTo(404);
	}

	@Test
	void trashingAnApplicationListsItInTheTrashAndRestoreBringsTheTimelineBack() throws Exception {
		var id = made(userA, "Acme");
		post("/api/applications/" + id + "/stage", userA, "{\"stage\":\"APPLIED\",\"fromStage\":\"SAVED\"}");
		var before = get("/api/applications/" + id, userA).body();

		assertThat(delete("/api/applications/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(delete("/api/applications/" + id, userA).statusCode()).isEqualTo(204);
		assertThat(get("/api/applications/" + id, userA).statusCode()).isEqualTo(404);
		assertThat(delete("/api/applications/" + id, userA).statusCode()).isEqualTo(404);

		var trash = get("/api/trash", userA);
		assertThat(trash.statusCode()).as(trash.body()).isEqualTo(200);
		assertThat(trash.body()).contains("\"kind\":\"APPLICATION\"").contains("\"id\":\"" + id + "\"");
		assertThat(get("/api/trash", userB).body()).doesNotContain(id);

		assertThat(post("/api/trash/items/" + id + "/restore", userA, null).statusCode()).isIn(200, 204);
		var after = get("/api/applications/" + id, userA).body();
		assertThat(after.substring(after.indexOf("\"timeline\""), after.indexOf("\"version\"")))
				.isEqualTo(before.substring(before.indexOf("\"timeline\""), before.indexOf("\"version\"")));
	}

	@Test
	void deleteForeverRemovesTheApplicationForGood() throws Exception {
		var id = made(userA, "Acme");
		delete("/api/applications/" + id, userA);

		assertThat(delete("/api/trash/items/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(delete("/api/trash/items/" + id, userA).statusCode()).isIn(200, 204);

		assertThat(get("/api/trash", userA).body()).doesNotContain(id);
		assertThat(post("/api/trash/items/" + id + "/restore", userA, null).statusCode()).isEqualTo(404);
		assertThat(jdbc.sql("select count(*) from application_contents where item_id = :id").param("id", UUID.fromString(id))
				.query(Long.class).single()).isZero();
	}

	@Test
	void trashingAFolderTakesItsApplicationsAndRestoringTheFolderBringsThemBack() throws Exception {
		var id = made(userA, "Acme");
		var folder = folder(userA, "Jobs");
		post("/api/items/" + id + "/move", userA, "{\"folderId\":\"" + folder + "\"}");

		assertThat(delete("/api/folders/" + folder, userA).statusCode()).isEqualTo(204);
		assertThat(get("/api/applications/" + id, userA).statusCode()).isEqualTo(404);
		// The Folder is the root in the Trash; its Application is counted inside it.
		assertThat(get("/api/trash", userA).body()).contains("\"id\":\"" + folder + "\"").doesNotContain("\"id\":\"" + id + "\"");

		assertThat(post("/api/trash/folders/" + folder + "/restore", userA, null).statusCode()).isIn(200, 204);
		assertThat(get("/api/applications/" + id, userA).statusCode()).isEqualTo(200);
	}

}
