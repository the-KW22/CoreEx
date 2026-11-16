package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
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

class ResumeApiTest extends ApiTest {

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

	private String made(String token, String body) throws Exception {
		var created = post("/api/resumes", token, body);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	/** A document with the given summary and one experience entry with the given description. */
	private static Map<String, Object> document(String summary, String description) {
		var entry = Map.of("id", "e1", "title", "Engineer", "description", description);
		var section = Map.of("id", "s1", "kind", "EXPERIENCE", "title", "Experience", "entries", List.of(entry));
		return Map.of("basics", Map.of("name", "Ada Lovelace", "headline", "Engineer", "email", "ada@example.com"),
				"summary", summary, "sections", List.of(section));
	}

	private static String save(String title, int version, Map<String, Object> document) {
		return JSON.writeValueAsString(Map.of("title", title, "version", version, "document", document));
	}

	@Test
	void aBlankResumeIsCreatedAndRead() throws Exception {
		var id = made(userA, "{}");

		var read = get("/api/resumes/" + id, userA);
		assertThat(read.statusCode()).isEqualTo(200);
		assertThat(field(read.body(), "version")).isEqualTo("1");
		assertThat(read.body()).contains("\"sections\":[]").contains("\"locale\":\"en\"");
		assertThat(field(read.body(), "title")).isNotBlank();
	}

	@Test
	void aSampleResumeComesWithContent() throws Exception {
		var id = made(userA, "{\"sample\":true,\"title\":\"Sample\"}");

		var body = get("/api/resumes/" + id, userA).body();
		assertThat(body).contains("\"title\":\"Sample\"").contains("\"kind\":\"EXPERIENCE\"").contains("\"kind\":\"EDUCATION\"");
	}

	@Test
	void hostileHtmlComesBackStripped() throws Exception {
		var id = made(userA, "{}");
		var hostile = "<p onclick=\"x()\">Hi<script>alert(1)</script><a href=\"javascript:alert(1)\">bad</a><blink>b</blink></p>";

		var saved = put("/api/resumes/" + id, userA, save("CV", 1, document(hostile, hostile)));

		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		assertThat(saved.body()).contains("Hi").doesNotContain("<script", "alert", "onclick", "javascript:", "blink");
		assertThat(get("/api/resumes/" + id, userA).body()).doesNotContain("<script", "alert", "onclick", "javascript:", "blink");
	}

	@Test
	void aStaleSaveCounterIsRefused() throws Exception {
		var id = made(userA, "{}");
		assertThat(put("/api/resumes/" + id, userA, save("CV", 1, document("<p>a</p>", "<p>b</p>"))).statusCode()).isEqualTo(200);

		var stale = put("/api/resumes/" + id, userA, save("CV", 1, document("<p>c</p>", "<p>d</p>")));

		assertThat(stale.statusCode()).isEqualTo(409);
		assertThat(stale.body()).contains("VERSION_CONFLICT");
		assertThat(get("/api/resumes/" + id, userA).body()).contains("<p>a</p>").contains("\"version\":2");
	}

	@Test
	void plainTextAndMarkdownAreDerivedOnSave() throws Exception {
		var id = made(userA, "{}");

		put("/api/resumes/" + id, userA, save("CV", 1, document("<p><strong>Builds</strong> things</p>", "<ul><li><p>Shipped it</p></li></ul>")));

		var row = jdbc.sql("select plain_text, markdown from resume_contents where item_id = :id").param("id", UUID.fromString(id))
				.query((rs, n) -> List.of(rs.getString(1), rs.getString(2))).single();
		assertThat(row.get(0)).contains("Ada Lovelace", "Builds things", "Shipped it").doesNotContain("<");
		assertThat(row.get(1)).contains("# Ada Lovelace", "**Builds** things", "## Experience", "- Shipped it");
	}

	@Test
	void aNulCharacterIsNeverAServerError() throws Exception {
		var id = made(userA, "{}");

		// In rich text it is dropped; in a plain field the save is refused.
		var saved = put("/api/resumes/" + id, userA, save("CV", 1, document("<p>a\u0000b</p>", "")));
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		assertThat(saved.body()).contains("<p>ab</p>");

		Map<String, Object> plain = Map.of("basics", Map.of("name", "A\u0000da"));
		assertThat(put("/api/resumes/" + id, userA, save("CV", 2, plain)).statusCode()).isEqualTo(400);
	}

	@Test
	void renameChangesTheTitleInTheListAndRejectsBlank() throws Exception {
		var id = made(userA, "{\"title\":\"Old\"}");

		assertThat(put("/api/resumes/" + id + "/title", userA, "{\"title\":\" \"}").statusCode()).isEqualTo(400);
		assertThat(put("/api/resumes/" + id + "/title", userA, "{\"title\":\"New name\"}").statusCode()).isEqualTo(204);

		assertThat(get("/api/resumes", userA).body()).contains("\"title\":\"New name\"").doesNotContain("Old");
	}

	@Test
	void duplicatingMakesAnIndependentCopy() throws Exception {
		var id = made(userA, "{\"title\":\"Mine\"}");
		put("/api/resumes/" + id, userA, save("Mine", 1, document("<p>keep</p>", "<p>d</p>")));

		var copy = post("/api/resumes/" + id + "/duplicate", userA, null);

		assertThat(copy.statusCode()).as(copy.body()).isEqualTo(201);
		var copyId = field(copy.body(), "id");
		assertThat(copyId).isNotEqualTo(id);
		assertThat(copy.body()).contains("\"title\":\"Mine (copy)\"").contains("<p>keep</p>").contains("\"version\":1");
		assertThat(get("/api/resumes", userA).body()).contains("\"total\":2");
	}

	@Test
	void aMadeUpIdMakesOneResumeEvenWhenSentTwice() throws Exception {
		var id = UUID.randomUUID().toString();
		made(userA, "{\"id\":\"" + id + "\"}");
		assertThat(made(userA, "{\"id\":\"" + id + "\"}")).isEqualTo(id);

		assertThat(get("/api/resumes", userA).body()).contains("\"total\":1");
		// Another User's id is refused without saying whose it is.
		assertThat(post("/api/resumes", userB, "{\"id\":\"" + id + "\"}").statusCode()).isEqualTo(400);
	}

	@Test
	void anotherUserGets404OnEveryEndpoint() throws Exception {
		var id = made(userA, "{}");

		assertThat(get("/api/resumes/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(put("/api/resumes/" + id, userB, save("x", 1, document("", ""))).statusCode()).isEqualTo(404);
		assertThat(put("/api/resumes/" + id + "/title", userB, "{\"title\":\"x\"}").statusCode()).isEqualTo(404);
		assertThat(post("/api/resumes/" + id + "/duplicate", userB, null).statusCode()).isEqualTo(404);
		assertThat(get("/api/resumes", userB).body()).contains("\"total\":0").doesNotContain(id);
		// A Note id is not a Resume.
		var note = field(post("/api/notes", userA, "{\"title\":\"n\",\"body\":\"b\"}").body(), "id");
		assertThat(get("/api/resumes/" + note, userA).statusCode()).isEqualTo(404);
	}

	@Test
	void signedOutCallsAreRefused() throws Exception {
		assertThat(get("/api/resumes").statusCode()).isEqualTo(401);
	}

}
