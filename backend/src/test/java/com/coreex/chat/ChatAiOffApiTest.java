package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;

/** With no Shared key AI is off: a send is refused before the stream starts, and nothing is sent to any model. */
@Import(ScriptedChatTools.class)
@TestPropertySource(properties = { "coreex.ai.provider=anthropic", "coreex.ai.api-key=" })
class ChatAiOffApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	@Test
	void sendingWithAiOffIs503AiOffAndTheModelIsNeverAsked() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", "a@example.com").update();
		var token = TestJwts.tokenFor(id, "a@example.com");
		var chat = post("/api/chats", token, null).body().replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");

		var response = post("/api/chats/" + chat + "/messages", token, "{\"text\":\"Hi\"}");

		assertThat(response.statusCode()).isEqualTo(503);
		assertThat(response.body()).contains("\"code\":\"AI_OFF\"");
		assertThat(model.conversed()).isEmpty();
	}

}
