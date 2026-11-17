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

@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01" })
class ResumeAiImportApiTest extends ApiTest {

	@Autowired JdbcClient jdbc;
	@Autowired TestModel model;
	private String owner;

	@BeforeEach
	void prepare() {
		jdbc.sql("delete from users").update();
		model.clear();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", "import@example.com").update();
		owner = TestJwts.tokenFor(id, "import@example.com");
	}

	@Test
	void mapsOnlyEvidenceAndCreatesNothingUntilConfirmed() throws Exception {
		model.tokens(1, 1);
		model.answer("{\"name\":\"Alex Morgan\",\"sections\":[{\"kind\":\"EXPERIENCE\",\"title\":\"Experience\",\"entries\":[{\"title\":\"Engineer\",\"subtitle\":\"Example\",\"description\":\"Built services\"}]}]}");
		var result = post("/api/resumes/ai-import", owner, "{\"text\":\"Alex Morgan\\nExperience\\nEngineer\\nExample\\nBuilt services\"}");
		assertThat(result.statusCode()).as(result.body()).isEqualTo(200);
		assertThat(result.body()).contains("Alex Morgan", "EXPERIENCE", "Engineer", "Built services");
		assertThat(jdbc.sql("select count(*) from items").query(Long.class).single()).isZero();
		assertThat(model.asked().getFirst().system()).contains("untrusted", "never");
	}

	@Test
	void invalidOrInventedOutputCreatesNothing() throws Exception {
		model.tokens(1, 1);
		for (var answer : new String[] { "not json", "{\"name\":\"Invented Person\",\"sections\":[]}" }) {
			model.answer(answer);
			assertThat(post("/api/resumes/ai-import", owner, "{\"text\":\"Alex Morgan\"}").statusCode()).isEqualTo(502);
		}
		assertThat(jdbc.sql("select count(*) from items").query(Long.class).single()).isZero();
	}

	@Test
	void spentBudgetUsesTheSharedError() throws Exception {
		model.answer("{\"name\":\"Alex Morgan\",\"sections\":[]}");
		assertThat(post("/api/resumes/ai-import", owner, "{\"text\":\"Alex Morgan\"}").statusCode()).isEqualTo(200);
		assertThat(post("/api/resumes/ai-import", owner, "{\"text\":\"Alex Morgan\"}").statusCode()).isEqualTo(200);
		var result = post("/api/resumes/ai-import", owner, "{\"text\":\"Alex Morgan\"}");
		assertThat(result.statusCode()).isEqualTo(429);
		assertThat(result.body()).contains("AI_BUDGET_SPENT");
	}
}
