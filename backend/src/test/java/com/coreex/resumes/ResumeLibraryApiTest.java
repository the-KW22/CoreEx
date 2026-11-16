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

/** A Resume is an Item: it sits in a Folder, takes Tags, goes to the Trash and back, and is found by title. */
class ResumeLibraryApiTest extends ApiTest {

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

	private String made(String token, String title) throws Exception {
		var created = post("/api/resumes", token, JSON.writeValueAsString(Map.of("title", title)));
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String folder(String token, String name) throws Exception {
		var created = post("/api/folders", token, "{\"name\":\"" + name + "\",\"parentId\":null}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	@Test
	void aResumeMovesIntoAFolderAndTheFolderListsIt() throws Exception {
		var id = made(userA, "For Acme");
		var folder = folder(userA, "Jobs");

		var moved = post("/api/items/" + id + "/move", userA, "{\"folderId\":\"" + folder + "\"}");
		assertThat(moved.statusCode()).as(moved.body()).isEqualTo(200);

		assertThat(field(get("/api/resumes/" + id, userA).body(), "folderId")).isEqualTo(folder);
		assertThat(get("/api/items?folderId=" + folder, userA).body()).contains("\"id\":\"" + id + "\"").contains("\"type\":\"RESUME\"");
		assertThat(get("/api/resumes", userA).body()).contains("\"folderId\":\"" + folder + "\"");
		// Not another User's Resume or Folder.
		assertThat(post("/api/items/" + id + "/move", userB, "{\"folderId\":null}").statusCode()).isEqualTo(404);
		assertThat(post("/api/items/" + id + "/move", userA, "{\"folderId\":\"" + folder(userB, "Theirs") + "\"}").statusCode()).isEqualTo(404);
	}

	@Test
	void aResumeTakesTagsAndTheListCarriesThemForTheChips() throws Exception {
		var id = made(userA, "Tagged");
		made(userA, "Plain");

		var tagged = post("/api/items/" + id + "/tags", userA, "{\"name\":\"remote\"}");
		assertThat(tagged.statusCode()).as(tagged.body()).isIn(200, 201);
		var tagId = field(get("/api/items/" + id + "/tags", userA).body(), "id");

		assertThat(get("/api/items?tagId=" + tagId, userA).body()).contains("\"id\":\"" + id + "\"");
		var list = get("/api/resumes", userA).body();
		assertThat(list).contains("\"tags\":{\"" + id + "\":[{\"id\":\"" + tagId + "\",\"name\":\"remote\"");
		assertThat(get("/api/resumes", userB).body()).doesNotContain("remote");
		assertThat(post("/api/items/" + id + "/tags", userB, "{\"name\":\"remote\"}").statusCode()).isEqualTo(404);
	}

	@Test
	void trashingAResumeHidesItAndRestoreBringsTheDocumentBackUnchanged() throws Exception {
		var id = made(userA, "Keep me");
		var doc = JSON.writeValueAsString(Map.of("title", "Keep me", "version", 1, "document",
				Map.of("basics", Map.of("name", "Ada"), "summary", "<p>Kept <strong>whole</strong></p>")));
		put("/api/resumes/" + id, userA, doc);
		var before = get("/api/resumes/" + id, userA).body();
		var version = get("/api/resumes/" + id, userA).body();
		assertThat(version).contains("Kept <strong>whole</strong>");

		assertThat(delete("/api/resumes/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(delete("/api/resumes/" + id, userA).statusCode()).isEqualTo(204);
		assertThat(get("/api/resumes/" + id, userA).statusCode()).isEqualTo(404);
		assertThat(delete("/api/resumes/" + id, userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/resumes", userA).body()).doesNotContain(id);

		var trash = get("/api/trash", userA);
		assertThat(trash.body()).contains("\"kind\":\"RESUME\"").contains("\"id\":\"" + id + "\"");
		assertThat(get("/api/trash", userB).body()).doesNotContain(id);
		assertThat(post("/api/trash/items/" + id + "/restore", userB, null).statusCode()).isEqualTo(404);

		assertThat(post("/api/trash/items/" + id + "/restore", userA, null).statusCode()).isIn(200, 204);
		var after = get("/api/resumes/" + id, userA).body();
		// The document, counter and title are what they were; only the time of the last change moved.
		assertThat(after.substring(after.indexOf("\"document\""), after.indexOf("\"locked\""))).isEqualTo(before.substring(before.indexOf("\"document\""), before.indexOf("\"locked\"")));
	}

	@Test
	void deleteForeverRemovesTheResumeAndItsVersions() throws Exception {
		var id = made(userA, "Gone");
		var body = JSON.writeValueAsString(Map.of("title", "Gone", "version", 1, "document", Map.of("basics", Map.of("name", "One"))));
		put("/api/resumes/" + id, userA, body);
		var body2 = JSON.writeValueAsString(Map.of("title", "Gone", "version", 2, "document", Map.of("basics", Map.of("name", "Two"))));
		put("/api/resumes/" + id, userA, body2);
		post("/api/resumes/" + id + "/versions", userA, "{\"name\":\"Keep\"}");
		delete("/api/resumes/" + id, userA);

		assertThat(delete("/api/trash/items/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(delete("/api/trash/items/" + id, userA).statusCode()).isIn(200, 204);

		assertThat(get("/api/trash", userA).body()).doesNotContain(id);
		assertThat(jdbc.sql("select count(*) from resume_versions").query(Long.class).single()).isZero();
		assertThat(jdbc.sql("select count(*) from resume_contents").query(Long.class).single()).isZero();
	}

	@Test
	void theListIsSearchedByTitleAndSorted() throws Exception {
		var beta = made(userA, "Beta engineer");
		var alpha = made(userA, "Alpha designer");
		var gamma = made(userA, "Gamma 100% engineer");
		// Beta changed last, then the others in turn: updated order is beta, gamma, alpha reversed by the saves below.
		jdbc.sql("update items set created_at = now() - interval '3 days', updated_at = now() - interval '1 day' where id = :id::uuid").param("id", beta).update();
		jdbc.sql("update items set created_at = now() - interval '2 days', updated_at = now() - interval '3 days' where id = :id::uuid").param("id", alpha).update();
		jdbc.sql("update items set created_at = now() - interval '1 day', updated_at = now() where id = :id::uuid").param("id", gamma).update();

		assertThat(titles(get("/api/resumes?sort=name", userA).body())).containsExactly("Alpha designer", "Beta engineer", "Gamma 100% engineer");
		assertThat(titles(get("/api/resumes?sort=created", userA).body())).containsExactly("Gamma 100% engineer", "Alpha designer", "Beta engineer");
		assertThat(titles(get("/api/resumes?sort=updated", userA).body())).containsExactly("Gamma 100% engineer", "Beta engineer", "Alpha designer");
		assertThat(titles(get("/api/resumes", userA).body())).containsExactly("Gamma 100% engineer", "Beta engineer", "Alpha designer");

		// Case does not matter, and % and _ are letters.
		assertThat(titles(get("/api/resumes?q=ENGINEER&sort=name", userA).body())).containsExactly("Beta engineer", "Gamma 100% engineer");
		assertThat(titles(get("/api/resumes?q=100%25", userA).body())).containsExactly("Gamma 100% engineer");
		assertThat(titles(get("/api/resumes?q=%25", userA).body())).containsExactly("Gamma 100% engineer");
		assertThat(get("/api/resumes?q=ENGINEER", userA).body()).contains("\"total\":2");
		assertThat(get("/api/resumes?q=engineer", userB).body()).contains("\"total\":0");
		// An unknown sort is the default.
		assertThat(titles(get("/api/resumes?sort=nonsense", userA).body())).first().isEqualTo("Gamma 100% engineer");
	}

	private static java.util.List<String> titles(String body) {
		return Pattern.compile("\"title\":\"([^\"]*)\"").matcher(body).results().map(m -> m.group(1)).toList();
	}

}
