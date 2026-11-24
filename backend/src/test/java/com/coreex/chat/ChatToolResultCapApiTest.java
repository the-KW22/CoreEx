package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** A tool result longer than the cap is cut, with a note saying so, so one huge Note cannot fill the context. */
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.chat.max-tool-result-characters=200" })
class ChatToolResultCapApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String CUT = "…(cut: result too long, narrow your request)";

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	@Test
	void aHugeToolResultIsCutAtTheCapWithANoteSayingSo() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", "a@example.com").update();
		var token = TestJwts.tokenFor(id, "a@example.com");
		var note = JSON.readTree(post("/api/notes", token,
				"{\"title\":\"Huge\",\"body\":\"" + "x".repeat(3000) + "\",\"folderId\":null}").body()).path("id").asString();
		var chat = JSON.readTree(post("/api/chats", token, null).body()).path("id").asString();
		model.script(TestModel.toolUse("get_item", "{\"id\":\"" + note + "\"}"), TestModel.text("done"));

		post("/api/chats/" + chat + "/messages", token, "{\"text\":\"Read it\"}");

		var result = firstToolResult(get("/api/chats/" + chat, token).body());
		assertThat(result.path("isError").asBoolean()).isFalse();
		var content = result.path("content").asString();
		assertThat(content).endsWith(CUT);
		assertThat(content.length()).isLessThanOrEqualTo(200 + CUT.length());
	}

	private static JsonNode firstToolResult(String chatJson) {
		for (var message : JSON.readTree(chatJson).path("messages")) {
			for (var block : message.path("blocks")) {
				if ("tool_result".equals(block.path("type").asString())) {
					return block;
				}
			}
		}
		throw new AssertionError("no tool result in " + chatJson);
	}

}
