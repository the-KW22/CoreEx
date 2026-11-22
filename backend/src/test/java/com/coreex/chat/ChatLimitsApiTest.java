package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;

/** The tool-step limit, shrunk to two steps for the test, ends a reply with the continue note on its last answer. */
@Import(ScriptedChatTools.class)
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.chat.max-tool-steps=2" })
class ChatLimitsApiTest extends ApiTest {

	private static final String NOTE = "Time limit reached. Ask me to continue.";

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	private String token;

	private UUID chat;

	@BeforeEach
	void clean() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", "a@example.com").update();
		token = TestJwts.tokenFor(id, "a@example.com");
		chat = UUID.fromString(post("/api/chats", token, null).body().replaceAll(".*\"id\":\"([^\"]+)\".*", "$1"));
	}

	@Test
	void toolStepLimitEndsTheReplyWithTheContinueNoteOnTheLastAnswer() throws Exception {
		model.script(TestModel.toolUse("echo", "{\"q\":1}"), TestModel.toolUse("echo", "{\"q\":2}"),
				TestModel.text("never reached"));

		var response = post("/api/chats/" + chat + "/messages", token, "{\"text\":\"Keep going\"}");

		assertThat(response.body()).contains("event:done").contains("\"status\":\"COMPLETE\"");
		assertThat(model.conversed()).hasSize(2);
		var body = get("/api/chats/" + chat, token).body();
		assertThat(body).contains(NOTE).doesNotContain("never reached");
		assertThat(body.indexOf(NOTE)).isGreaterThan(body.indexOf("\"role\":\"ASSISTANT\""));
	}

}
