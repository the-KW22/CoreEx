package com.coreex.knowledge;

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

class KnowledgeApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String NOTE_BODY = "# Work\n\n- Led a team of five engineers\n- Cut build time by forty percent\n";

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

	private static JsonNode json(String body) {
		return JSON.readTree(body);
	}

	private String noteWith(String token, String title, String body) throws Exception {
		var created = post("/api/notes", token, JSON.writeValueAsString(java.util.Map.of("title", title, "body", body)));
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return json(created.body()).get("id").asText();
	}

	private String factBody(String text, String category) {
		return JSON.writeValueAsString(java.util.Map.of("text", text, "category", category));
	}

	private String createFact(String token, String text) throws Exception {
		var created = post("/api/knowledge/facts", token, factBody(text, "EXPERIENCE"));
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return json(created.body()).get("id").asText();
	}

	@Test
	void aFactByHandIsListedAndCanBeSwitchedOff() throws Exception {
		var id = createFact(userA, "Built a payments service in Java");
		var listed = get("/api/knowledge/facts", userA);
		assertThat(listed.body()).contains("Built a payments service in Java");

		var off = put("/api/knowledge/facts/" + id + "/status", userA, "{\"status\":\"OFF\"}");
		assertThat(off.statusCode()).isEqualTo(200);
		var filtered = get("/api/knowledge/facts?status=ACTIVE", userA);
		assertThat(filtered.body()).doesNotContain("Built a payments service in Java");
		var stillStored = get("/api/knowledge/facts?status=OFF", userA);
		assertThat(stillStored.body()).contains("Built a payments service in Java");
	}

	@Test
	void correctingAFactKeepsTheEarlierWordingAsARevision() throws Exception {
		var id = createFact(userA, "Led a team");
		var corrected = put("/api/knowledge/facts/" + id, userA, factBody("Led a team of five engineers", "EXPERIENCE"));
		assertThat(corrected.statusCode()).isEqualTo(200);
		var revisions = json(corrected.body()).get("revisions");
		assertThat(revisions).hasSize(1);
		assertThat(revisions.get(0).get("text").asText()).isEqualTo("Led a team");
		assertThat(json(corrected.body()).get("text").asText()).isEqualTo("Led a team of five engineers");
	}

	@Test
	void aPulledFactQuoteMustAppearInTheCurrentSource() throws Exception {
		var note = noteWith(userA, "Work", NOTE_BODY);
		var refused = post("/api/knowledge/facts", userA, JSON.writeValueAsString(java.util.Map.of("text", "Ran a marathon",
				"category", "ACHIEVEMENT", "sourceKind", "NOTE", "sourceId", note, "quote", "Ran a marathon")));
		assertThat(refused.statusCode()).isEqualTo(400);
		assertThat(json(refused.body()).get("code").asText()).isEqualTo("QUOTE_NOT_IN_SOURCE");

		var accepted = post("/api/knowledge/facts", userA, JSON.writeValueAsString(java.util.Map.of("text", "Led a team of five engineers",
				"category", "EXPERIENCE", "sourceKind", "NOTE", "sourceId", note, "quote", "Led a team of five engineers")));
		assertThat(accepted.statusCode()).isEqualTo(201);
	}

	@Test
	void forgettingAFactRemovesItsTextAndBlocksItsSourceForGood() throws Exception {
		var note = noteWith(userA, "Work", NOTE_BODY);
		var quote = "Led a team of five engineers";
		var made = post("/api/knowledge/facts", userA, JSON.writeValueAsString(java.util.Map.of("text", quote, "category", "EXPERIENCE",
				"sourceKind", "NOTE", "sourceId", note, "quote", quote)));
		var id = json(made.body()).get("id").asText();
		put("/api/knowledge/facts/" + id, userA, factBody("Led a team of five people", "EXPERIENCE"));

		assertThat(delete("/api/knowledge/facts/" + id, userA).statusCode()).isEqualTo(204);
		assertThat(jdbc.sql("select count(*) from facts where text like '%engineers%' or text like '%people%'").query(Long.class).single()).isZero();
		assertThat(jdbc.sql("select count(*) from fact_revisions").query(Long.class).single()).isZero();

		var again = post("/api/knowledge/facts", userA, JSON.writeValueAsString(java.util.Map.of("text", quote, "category", "EXPERIENCE",
				"sourceKind", "NOTE", "sourceId", note, "quote", quote)));
		assertThat(again.statusCode()).isEqualTo(409);
		assertThat(json(again.body()).get("code").asText()).isEqualTo("FORGOTTEN");
		assertThat(get("/api/knowledge/facts/candidates?sourceKind=NOTE&sourceId=" + note, userA).body()).doesNotContain(quote);
	}

	@Test
	void candidatesOfANoteAreSplitIntoBulletsWithTheirExactQuote() throws Exception {
		var note = noteWith(userA, "Work", NOTE_BODY);
		var found = get("/api/knowledge/facts/candidates?sourceKind=NOTE&sourceId=" + note, userA);
		assertThat(found.statusCode()).isEqualTo(200);
		var candidates = json(found.body());
		assertThat(candidates.get(0).get("quote").asText()).isEqualTo("Led a team of five engineers");
		assertThat(candidates.get(1).get("quote").asText()).isEqualTo("Cut build time by forty percent");
	}

	@Test
	void anotherUserGetsNotFoundOnFactsAndSources() throws Exception {
		var note = noteWith(userA, "Work", NOTE_BODY);
		var id = createFact(userA, "Led a team");
		assertThat(get("/api/knowledge/facts/candidates?sourceKind=NOTE&sourceId=" + note, userB).statusCode()).isEqualTo(404);
		assertThat(put("/api/knowledge/facts/" + id, userB, factBody("x", "OTHER")).statusCode()).isEqualTo(404);
		assertThat(put("/api/knowledge/facts/" + id + "/status", userB, "{\"status\":\"OFF\"}").statusCode()).isEqualTo(404);
		assertThat(delete("/api/knowledge/facts/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(post("/api/knowledge/facts", userB, JSON.writeValueAsString(java.util.Map.of("text", "Led a team of five engineers",
				"category", "EXPERIENCE", "sourceKind", "NOTE", "sourceId", note, "quote", "Led a team of five engineers"))).statusCode())
				.isEqualTo(404);
	}

	@Test
	void aNewStoryHasTheFiveHeadingsAndClearingItRemovesIt() throws Exception {
		var created = post("/api/knowledge/stories", userA, "{\"title\":\"Outage\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		var id = json(created.body()).get("id").asText();
		var body = json(created.body()).get("body").asText();
		for (var heading : new String[] { "## Situation", "## Task", "## Action", "## Result", "## Reflection" }) {
			assertThat(body).contains(heading);
		}
		assertThat(get("/api/knowledge/stories", userA).body()).contains("Outage");

		assertThat(put("/api/knowledge/notes/" + id + "/story", userA, "{\"story\":false}").statusCode()).isEqualTo(200);
		assertThat(get("/api/knowledge/stories", userA).body()).doesNotContain("Outage");
		assertThat(get("/api/notes/" + id, userA).statusCode()).isEqualTo(200);
		assertThat(put("/api/knowledge/notes/" + id + "/story", userB, "{\"story\":true}").statusCode()).isEqualTo(404);
	}

	@Test
	void preferencesSaveAndReload() throws Exception {
		var saved = put("/api/knowledge/preferences", userA, JSON.writeValueAsString(java.util.Map.of("targetRoles", "Backend engineer",
				"places", java.util.List.of("REMOTE"), "minBasePay", 60000, "currency", "GBP", "payPeriod", "YEAR",
				"officeDaysPerWeek", 2, "noticePeriod", "1 month")));
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		var reloaded = json(get("/api/knowledge/preferences", userA).body());
		assertThat(reloaded.get("targetRoles").asText()).isEqualTo("Backend engineer");
		assertThat(reloaded.get("currency").asText()).isEqualTo("GBP");
		assertThat(get("/api/knowledge/preferences", userB).body()).doesNotContain("Backend engineer");
	}

	@Test
	void minimumPayNeedsACurrencyAndAPayPeriod() throws Exception {
		var refused = put("/api/knowledge/preferences", userA, "{\"minBasePay\":60000}");
		assertThat(refused.statusCode()).isEqualTo(400);
		assertThat(json(refused.body()).get("code").asText()).isEqualTo("INVALID_REQUEST");
	}

}
