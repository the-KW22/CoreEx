package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;

/** With no Shared key (the default) AI is off: it says so, and nothing is sent to any model. */
@TestPropertySource(properties = { "coreex.ai.provider=anthropic", "coreex.ai.api-key=" })
class FillWithAiOffApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	@Test
	void withoutAKeyAiIsOffAndTheModelIsNeverAsked() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", "a@example.com").update();

		var response = post("/api/applications/fill-with-ai", TestJwts.tokenFor(id, "a@example.com"), "{\"text\":\"A posting\"}");

		assertThat(response.statusCode()).isEqualTo(503);
		assertThat(response.body()).contains("\"code\":\"AI_OFF\"");
		assertThat(model.asked()).isEmpty();
	}

	@Test
	void theStatusSaysAiIsNotAvailableSoScreensCanShowItAsPendingInsteadOfAnError() throws Exception {
		jdbc.sql("delete from users").update();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", "a@example.com").update();

		var status = get("/api/ai/status", TestJwts.tokenFor(id, "a@example.com"));

		assertThat(status.statusCode()).isEqualTo(200);
		assertThat(status.body()).contains("\"available\":false");
		assertThat(get("/api/ai/status").statusCode()).isEqualTo(401);
	}

}
