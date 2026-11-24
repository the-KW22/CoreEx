package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;
import com.coreex.ai.Model.Turn;
import com.coreex.common.ApiException;
import com.coreex.knowledge.KnowledgeService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Proposals of a Fact or a Story from a Career Chat (#290, ADR 0013): a Fact's quote must be in the User's own messages, is
 * checked when proposed and again when approved, and nothing is saved until the User approves.
 */
@TestPropertySource(properties = "coreex.ai.provider=fake")
class ChatCareerProposalsApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	@Autowired
	KnowledgeService knowledge;

	private String token;

	private String otherToken;

	private UUID chat;

	@BeforeEach
	void clean() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		token = TestJwts.tokenFor(person("a@example.com"), "a@example.com");
		otherToken = TestJwts.tokenFor(person("b@example.com"), "b@example.com");
		var created = post("/api/chats", token, "{\"scope\":\"CAREER\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		chat = UUID.fromString(JSON.readTree(created.body()).path("id").asString());
	}

	private UUID person(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email)
				.update();
		return id;
	}

	private UUID userId(String email) {
		return jdbc.sql("select id from users where email = :email").param("email", email).query(UUID.class).single();
	}

	private String say(String text, Turn... turns) throws Exception {
		model.script(turns);
		var response = post("/api/chats/" + chat + "/messages", token, JSON.writeValueAsString(Map.of("text", text)));
		assertThat(response.body()).contains("event:done");
		return response.body();
	}

	private JsonNode detail() throws Exception {
		var response = get("/api/chats/" + chat, token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return JSON.readTree(response.body());
	}

	private JsonNode proposal(int index) throws Exception {
		return detail().path("proposals").get(index);
	}

	private int answer(String decision, UUID... ids) throws Exception {
		var body = new LinkedHashMap<String, Object>();
		body.put("ids", List.of(ids));
		body.put("decision", decision);
		return post("/api/chats/" + chat + "/proposals/answer", token, JSON.writeValueAsString(body)).statusCode();
	}

	private static UUID id(JsonNode proposal) {
		return UUID.fromString(proposal.path("id").asString());
	}

	private boolean factExists(String text) throws Exception {
		return get("/api/knowledge/facts", token).body().contains("\"" + text + "\"");
	}

	private boolean storyExists(String title) throws Exception {
		return get("/api/knowledge/stories", token).body().contains("\"" + title + "\"");
	}

	@Test
	void aFactProposalIsPendingUntilApprovedAndThenSavedFromTheChat() throws Exception {
		var sent = UUID.randomUUID();
		say("I led the payments team of four.", TestModel.toolUse("add_fact", "{\"text\":\"Led a team of four\",\"category\":\"ACHIEVEMENT\","
				+ "\"quote\":\"led the payments team of four\",\"sourceKind\":\"NOTE\",\"sourceId\":\"" + sent + "\"}"),
				TestModel.text("Proposed."));

		var stored = proposal(0);
		assertThat(stored.path("status").asString()).isEqualTo("PENDING");
		assertThat(stored.path("label").asString()).isEqualTo("Add a Fact to Knowledge");
		assertThat(stored.path("details").path("sourceKind").asString()).isEqualTo("CHAT");
		assertThat(stored.path("details").path("sourceId").asString()).isEqualTo(chat.toString());
		assertThat(factExists("Led a team of four")).isFalse();

		assertThat(answer("APPROVE", id(stored))).isEqualTo(200);

		assertThat(proposal(0).path("status").asString()).isEqualTo("APPLIED");
		assertThat(factExists("Led a team of four")).isTrue();
		assertThat(jdbc.sql("select source_kind from facts where text = :text").param("text", "Led a team of four")
				.query(String.class).single()).isEqualTo("CHAT");
		assertThat(jdbc.sql("select source_id from facts where text = :text").param("text", "Led a team of four")
				.query(UUID.class).single()).isEqualTo(chat);
		assertThat(jdbc.sql("select quote from facts where text = :text").param("text", "Led a team of four")
				.query(String.class).single()).isEqualTo("led the payments team of four");
	}

	@Test
	void aQuoteThatIsNotInTheUsersMessagesIsRefusedWithNoProposal() throws Exception {
		say("I led the payments team.", TestModel.toolUse("add_fact", "{\"text\":\"Invented\",\"category\":\"SKILL\",\"quote\":\"invented words\"}"),
				TestModel.text("done"));

		assertThat(detail().path("proposals")).isEmpty();
		assertThat(detail().toString()).contains("That quote is not in your messages in this Chat.");
	}

	@Test
	void aQuoteOnlyInTheAssistantsWordsIsRefused() throws Exception {
		say("Hello", TestModel.text("You are a skilled planner."));
		say("Ok", TestModel.toolUse("add_fact", "{\"text\":\"Skilled planner\",\"category\":\"SKILL\",\"quote\":\"skilled planner\"}"),
				TestModel.text("done"));

		assertThat(detail().path("proposals")).isEmpty();
		assertThat(detail().toString()).contains("That quote is not in your messages in this Chat.");
	}

	@Test
	void aQuoteThatRunsAcrossTwoMessagesIsRefused() throws Exception {
		say("I led the payments", TestModel.text("ok"));
		say("team of four", TestModel.toolUse("add_fact", "{\"text\":\"Led a team\",\"category\":\"SKILL\",\"quote\":\"payments\\nteam of four\"}"),
				TestModel.text("done"));

		assertThat(detail().path("proposals")).isEmpty();
	}

	@Test
	void approvingAFactWhoseQuoteNoLongerMatchesIsRefused() {
		assertThatThrownBy(() -> knowledge.create(userId("a@example.com"), "Never said", "SKILL", "CHAT", chat, "words never said"))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST));
	}

	@Test
	void aChatOfAnotherUserCannotBeQuoted() throws Exception {
		say("I led the payments team.", TestModel.text("ok"));
		assertThatThrownBy(() -> knowledge.create(userId("b@example.com"), "Stolen", "SKILL", "CHAT", chat, "led the payments team"))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST));
	}

	@Test
	void aStoryProposalCreatesAStoryOnlyWhenApproved() throws Exception {
		say("Tell me about the outage", TestModel.toolUse("add_story", "{\"title\":\"Payments outage\",\"situation\":\"Checkout failed.\","
				+ "\"action\":\"I rolled back the release.\",\"result\":\"Checkout was back in ten minutes.\"}"), TestModel.text("Proposed."));

		var stored = proposal(0);
		assertThat(stored.path("status").asString()).isEqualTo("PENDING");
		assertThat(stored.path("label").asString()).isEqualTo("Add a Story Note");
		assertThat(storyExists("Payments outage")).isFalse();

		assertThat(answer("APPROVE", id(stored))).isEqualTo(200);

		assertThat(storyExists("Payments outage")).isTrue();
		assertThat(proposal(0).path("link").path("type").asString()).isEqualTo("NOTE");
	}

	@Test
	void aRejectedStoryProposalSavesNothing() throws Exception {
		say("Tell me about the outage", TestModel.toolUse("add_story", "{\"title\":\"Rejected story\",\"situation\":\"s\","
				+ "\"action\":\"a\",\"result\":\"r\"}"), TestModel.text("Proposed."));

		assertThat(answer("REJECT", id(proposal(0)))).isEqualTo(200);

		assertThat(proposal(0).path("status").asString()).isEqualTo("REJECTED");
		assertThat(storyExists("Rejected story")).isFalse();
	}

	@Test
	void anotherUserCannotAnswerAFactProposal() throws Exception {
		say("I led the payments team.", TestModel.toolUse("add_fact", "{\"text\":\"Led a team\",\"category\":\"SKILL\","
				+ "\"quote\":\"led the payments team\"}"), TestModel.text("Proposed."));
		var body = JSON.writeValueAsString(Map.of("ids", List.of(id(proposal(0))), "decision", "APPROVE"));

		assertThat(post("/api/chats/" + chat + "/proposals/answer", otherToken, body).statusCode()).isEqualTo(404);
		assertThat(proposal(0).path("status").asString()).isEqualTo("PENDING");
	}

}
