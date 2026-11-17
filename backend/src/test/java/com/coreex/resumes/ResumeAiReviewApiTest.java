package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;
import tools.jackson.databind.json.JsonMapper;

@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01" })
class ResumeAiReviewApiTest extends ApiTest {
	@Autowired JdbcClient jdbc;
	@Autowired TestModel model;
	private final JsonMapper json = JsonMapper.builder().build();
	private String owner, resume;
	@BeforeEach void prepare() throws Exception {
		jdbc.sql("delete from users").update(); model.clear(); model.tokens(1, 1);
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", "review@example.com").update();
		owner = TestJwts.tokenFor(id, "review@example.com");
		resume = json.readTree(post("/api/resumes", owner, "{\"sample\":true}").body()).get("id").asText();
	}
	@Test void acceptsMatchingFieldsAndIgnoresUnknownTargets() throws Exception {
		var current = json.readTree(get("/api/resumes/" + resume, owner).body());
		var original = current.path("document").path("summary").asText();
		model.answer(json.writeValueAsString(Map.of("suggestions", java.util.List.of(
				Map.of("field", "summary", "original", original, "suggestion", "<p>Engineer with experience.</p>"),
				Map.of("field", "entry:missing:description", "original", "missing", "suggestion", "missing")))));
		var review = post("/api/resumes/" + resume + "/reviews", owner, "{\"version\":1}");
		assertThat(review.statusCode()).as(review.body()).isEqualTo(201);
		var tree = json.readTree(review.body());
		assertThat(tree.path("suggestions").size()).isEqualTo(1);
		var reviewId = tree.path("id").asText();
		var suggestionId = tree.path("suggestions").get(0).path("id").asText();
		var result = post("/api/resumes/" + resume + "/reviews/" + reviewId + "/accept", owner,
				json.writeValueAsString(Map.of("ids", java.util.List.of(suggestionId))));
		assertThat(result.statusCode()).as(result.body()).isEqualTo(200);
		assertThat(get("/api/resumes/" + resume, owner).body()).contains("Engineer with experience.");
		assertThat(get("/api/resumes/" + resume + "/versions", owner).body()).contains("savedAt");
	}
	@Test void changedTargetIsDropped() throws Exception {
		var current = json.readTree(get("/api/resumes/" + resume, owner).body());
		var original = current.path("document").path("summary").asText();
		model.answer(json.writeValueAsString(Map.of("suggestions", java.util.List.of(Map.of("field", "summary", "original", original, "suggestion", "<p>Engineer.</p>")))));
		var review = json.readTree(post("/api/resumes/" + resume + "/reviews", owner, "{\"version\":1}").body());
		var document = (tools.jackson.databind.node.ObjectNode) current.path("document");
		document.put("summary", "<p>Changed by the user.</p>");
		assertThat(put("/api/resumes/" + resume, owner, json.writeValueAsString(Map.of("title", current.path("title").asText(), "document", document, "version", 1))).statusCode()).isEqualTo(200);
		var result = post("/api/resumes/" + resume + "/reviews/" + review.path("id").asText() + "/accept", owner,
				json.writeValueAsString(Map.of("ids", java.util.List.of(review.path("suggestions").get(0).path("id").asText()))));
		assertThat(result.statusCode()).as(result.body()).isEqualTo(200);
		assertThat(get("/api/resumes/" + resume, owner).body()).contains("Changed by the user.");
		assertThat(get("/api/resumes/" + resume + "/reviews", owner).body()).doesNotContain("Engineer.</p>");
		document.put("summary", original);
		assertThat(put("/api/resumes/" + resume, owner, json.writeValueAsString(Map.of("title", current.path("title").asText(), "document", document, "version", 2))).statusCode()).isEqualTo(200);
		assertThat(get("/api/resumes/" + resume + "/reviews", owner).body()).doesNotContain("Engineer.</p>");
	}
	@Test void anotherUserCannotReadOrCreateAReview() throws Exception {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", "other@example.com").update();
		var other = TestJwts.tokenFor(id, "other@example.com");
		assertThat(get("/api/resumes/" + resume + "/reviews", other).statusCode()).isEqualTo(404);
		assertThat(post("/api/resumes/" + resume + "/reviews", other, "{\"version\":1}").statusCode()).isEqualTo(404);
		assertThat(model.asked()).isEmpty();
	}
	@Test void acceptAllSkipsChangedTextAndAppliesTheOtherField() throws Exception {
		var current = json.readTree(get("/api/resumes/" + resume, owner).body());
		var document = (tools.jackson.databind.node.ObjectNode) current.path("document");
		var summary = document.path("summary").asText();
		var description = document.path("sections").get(0).path("entries").get(0).path("description").asText();
		model.answer(json.writeValueAsString(Map.of("suggestions", java.util.List.of(
				Map.of("field", "summary", "original", summary, "suggestion", "<p>Engineer.</p>"),
				Map.of("field", "entry:exp-1:description", "original", description, "suggestion", "<p>Led a team.</p>")))));
		var review = json.readTree(post("/api/resumes/" + resume + "/reviews", owner, "{\"version\":1}").body());
		document.put("summary", "<p>Changed locally.</p>");
		assertThat(put("/api/resumes/" + resume, owner, json.writeValueAsString(Map.of("title", current.path("title").asText(), "document", document, "version", 1))).statusCode()).isEqualTo(200);
		var suggestions = review.path("suggestions");
		var ids = java.util.List.of(suggestions.get(0).path("id").asText(), suggestions.get(1).path("id").asText());
		var accepted = post("/api/resumes/" + resume + "/reviews/" + review.path("id").asText() + "/accept", owner, json.writeValueAsString(Map.of("ids", ids)));
		assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(200);
		assertThat(accepted.body()).contains("Changed locally.", "Led a team.").doesNotContain("<p>Engineer.</p>");
	}
}
