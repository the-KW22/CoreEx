package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;
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
class ResumeAiImproveApiTest extends ApiTest {
	@Autowired JdbcClient jdbc;
	@Autowired TestModel model;
	private String owner, resume;
	private final JsonMapper json = JsonMapper.builder().build();
	@BeforeEach void prepare() throws Exception {
		jdbc.sql("delete from users").update(); model.clear(); model.tokens(1, 1);
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", "improve@example.com").update();
		owner = TestJwts.tokenFor(id, "improve@example.com");
		resume = json.readTree(post("/api/resumes", owner, "{\"sample\":true}").body()).get("id").asText();
	}
	@Test void proposalDoesNotChangeTheResumeAndAcceptKeepsAHistoryVersion() throws Exception {
		var before = json.readTree(get("/api/resumes/" + resume, owner).body());
		var original = before.get("document").get("summary").asText();
		model.answer("{\"suggestion\":\"<p>Experienced software engineer.</p>\"}");
		var made = post("/api/resumes/" + resume + "/improve", owner, "{\"field\":\"summary\",\"version\":1}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(200);
		assertThat(get("/api/resumes/" + resume, owner).body()).doesNotContain("Experienced software engineer.");
		var body = json.writeValueAsString(java.util.Map.of("field", "summary", "version", 1, "original", original, "suggestion", "<p>Experienced software engineer.</p>"));
		var accepted = post("/api/resumes/" + resume + "/improve/accept", owner, body);
		assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(200);
		assertThat(accepted.body()).contains("Experienced software engineer.");
		assertThat(get("/api/resumes/" + resume + "/versions", owner).body()).contains("savedAt");
		assertThat(post("/api/resumes/" + resume + "/improve/accept", owner, body).statusCode()).isEqualTo(409);
	}
	@Test void refusesMissingFieldsAndInventedNumbers() throws Exception {
		model.answer("{\"suggestion\":\"<p>Achieved 999999%.</p>\"}");
		assertThat(post("/api/resumes/" + resume + "/improve", owner, "{\"field\":\"summary\",\"version\":1}").statusCode()).isEqualTo(502);
		assertThat(post("/api/resumes/" + resume + "/improve", owner, "{\"field\":\"entry:missing:description\",\"version\":1}").statusCode()).isEqualTo(400);
	}
	@Test void spentBudgetUsesTheSharedError() throws Exception {
		model.tokens(1000, 100);
		model.answer("{\"suggestion\":\"<p>Engineer with experience.</p>\"}");
		assertThat(post("/api/resumes/" + resume + "/improve", owner, "{\"field\":\"summary\",\"version\":1}").statusCode()).isEqualTo(200);
		assertThat(post("/api/resumes/" + resume + "/improve", owner, "{\"field\":\"summary\",\"version\":1}").statusCode()).isEqualTo(200);
		var result = post("/api/resumes/" + resume + "/improve", owner, "{\"field\":\"summary\",\"version\":1}");
		assertThat(result.statusCode()).isEqualTo(429);
		assertThat(result.body()).contains("AI_BUDGET_SPENT");
	}
}
