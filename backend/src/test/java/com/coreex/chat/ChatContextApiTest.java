package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;

import tools.jackson.databind.json.JsonMapper;

/**
 * The optional context of a send (issue #200): it reaches that reply's system prompt, is never stored, is limited by
 * validation, and an absent context changes nothing.
 */
@TestPropertySource(properties = "coreex.ai.provider=fake")
class ChatContextApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	private String token;

	private UUID chat;

	@BeforeEach
	void setUp() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, :role)").param("id", id)
				.param("email", "context@example.com").param("role", "USER").update();
		token = TestJwts.tokenFor(id, "context@example.com");
		var created = post("/api/chats", token, null);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		var matcher = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(created.body());
		matcher.find();
		chat = UUID.fromString(matcher.group(1));
	}

	private HttpResponse<String> send(String text, Map<String, Object> context) throws Exception {
		var body = new LinkedHashMap<String, Object>();
		body.put("text", text);
		if (context != null) {
			body.put("context", context);
		}
		return post("/api/chats/" + chat + "/messages", token, JSON.writeValueAsString(body));
	}

	private static Map<String, Object> context(UUID note) {
		return Map.of("open", Map.of("kind", "NOTE", "id", note.toString(), "title", "Garden plan"),
				"selection", "tomatoes basil",
				"trail", List.of(Map.of("action", "OPENED", "kind", "NOTE", "id", note.toString(), "title", "Garden plan"),
						Map.of("action", "SEARCHED", "kind", "SEARCH", "title", "garden")));
	}

	@Test
	void theContextReachesThatReplysSystemPromptAndIsNeverStored() throws Exception {
		model.script(TestModel.text("ok"));
		var note = UUID.randomUUID();

		var response = send("What is in it?", context(note));

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		assertThat(response.body()).contains("event:done");
		assertThat(model.conversed().get(0).system()).contains("<page>NOTE, " + note + ", Garden plan</page>")
				.contains("<selection>tomatoes basil</selection>")
				.contains("<trail>OPENED NOTE " + note + " Garden plan\nSEARCHED SEARCH garden</trail>");
		var stored = get("/api/chats/" + chat, token).body();
		assertThat(stored).contains("What is in it?").doesNotContain(note.toString())
				.doesNotContain("tomatoes basil").doesNotContain("Garden plan");
	}

	@Test
	void aSendWithoutContextStillRepliesWithThePlainPrompt() throws Exception {
		model.script(TestModel.text("ok"));

		var response = send("hi", null);

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		assertThat(response.body()).contains("event:done");
		assertThat(model.conversed().get(0).system()).isEqualTo(ChatPrompt.GENERAL);
	}

	@Test
	void aTrailOfTwentyOneOrASelectionOfTwoThousandOneCharactersIsRefusedWithoutStoringOrReplying() throws Exception {
		var step = Map.of("action", "OPENED", "kind", "NOTE", "title", "x");

		var tooManySteps = send("hi", Map.of("trail", Collections.nCopies(21, step)));
		var tooLong = send("hi", Map.of("selection", "a".repeat(2001)));

		assertThat(tooManySteps.statusCode()).isEqualTo(400);
		assertThat(tooLong.statusCode()).isEqualTo(400);
		assertThat(model.conversed()).isEmpty();
		assertThat(jdbc.sql("select count(*) from chat_messages").query(Integer.class).single()).isZero();
	}

}
