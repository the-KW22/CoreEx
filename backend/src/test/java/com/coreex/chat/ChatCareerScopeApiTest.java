package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
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
import com.coreex.ai.Model.ToolSpec;
import com.coreex.ai.Model.Turn;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Career scope of a Chat (#289): the scope and switches decide which tools a reply may use, for the model and for each
 * call, and an Application Chat sees only its own Application. Through HTTP with the scripted model.
 */
@TestPropertySource(properties = "coreex.ai.provider=fake")
class ChatCareerScopeApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	private String token;

	private String otherToken;

	@BeforeEach
	void clean() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		token = TestJwts.tokenFor(person("a@example.com"), "a@example.com");
		otherToken = TestJwts.tokenFor(person("b@example.com"), "b@example.com");
	}

	private UUID person(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email)
				.update();
		return id;
	}

	private UUID chat(String bearer, String body) throws Exception {
		var response = post("/api/chats", bearer, body);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
		return UUID.fromString(JSON.readTree(response.body()).path("id").asString());
	}

	private UUID application(String bearer, String company) throws Exception {
		var response = post("/api/applications", bearer, "{\"company\":\"" + company + "\",\"role\":\"Engineer\"}");
		assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
		return UUID.fromString(JSON.readTree(response.body()).path("id").asString());
	}

	/** Sends a message with the given JSON body (the text, and any switches), playing the turns in order. */
	private HttpResponse<String> send(UUID chat, String body, Turn... turns) throws Exception {
		model.script(turns);
		var response = post("/api/chats/" + chat + "/messages", token, body);
		assertThat(response.body()).contains("event:done");
		return response;
	}

	private String say(UUID chat, String text, Turn... turns) throws Exception {
		return send(chat, JSON.writeValueAsString(Map.of("text", text)), turns).body();
	}

	private JsonNode detail(UUID chat) throws Exception {
		var response = get("/api/chats/" + chat, token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return JSON.readTree(response.body());
	}

	/** The tool names the model was offered in the last call. */
	private List<String> offered() {
		var calls = model.conversed();
		return calls.get(calls.size() - 1).tools().stream().map(ToolSpec::name).toList();
	}

	/** What the model was sent in the last call, as text, so a test can see what it was told. */
	private String lastSent() {
		var calls = model.conversed();
		return calls.get(calls.size() - 1).messages().toString();
	}

	@Test
	void aChatWithNoBodyIsGeneralAsBefore() throws Exception {
		var created = JSON.readTree(post("/api/chats", token, null).body());

		assertThat(created.path("scope").asString()).isEqualTo("GENERAL");
		assertThat(created.path("useNotes").asBoolean()).isTrue();
		assertThat(created.path("applicationId").isNull()).isTrue();
		assertThat(created.path("useApplications").asBoolean()).isTrue();
		assertThat(created.path("useKnowledge").asBoolean()).isTrue();
	}

	@Test
	void aCareerOrApplicationChatStartsWithUseMyNotesOff() throws Exception {
		var career = JSON.readTree(post("/api/chats", token, "{\"scope\":\"CAREER\"}").body());
		assertThat(career.path("scope").asString()).isEqualTo("CAREER");
		assertThat(career.path("useNotes").asBoolean()).isFalse();

		var mine = application(token, "Mine Ltd");
		var app = JSON.readTree(post("/api/chats", token, "{\"scope\":\"APPLICATION\",\"applicationId\":\"" + mine + "\"}").body());
		assertThat(app.path("scope").asString()).isEqualTo("APPLICATION");
		assertThat(app.path("applicationId").asString()).isEqualTo(mine.toString());
		assertThat(app.path("useNotes").asBoolean()).isFalse();
	}

	@Test
	void aScopeNeedsItsOwnApplicationAndAnApplicationNeedsOne() throws Exception {
		var theirs = application(otherToken, "Theirs Ltd");
		var mine = application(token, "Mine Ltd");

		assertThat(post("/api/chats", token, "{\"scope\":\"APPLICATION\",\"applicationId\":\"" + theirs + "\"}").statusCode())
				.isEqualTo(404);
		assertThat(post("/api/chats", token, "{\"scope\":\"APPLICATION\"}").statusCode()).isEqualTo(400);
		assertThat(post("/api/chats", token, "{\"scope\":\"CAREER\",\"applicationId\":\"" + mine + "\"}").statusCode()).isEqualTo(400);
	}

	@Test
	void aGeneralChatIsNotOfferedCareerToolsAndACallToOneIsRefused() throws Exception {
		var chat = chat(token, null);

		say(chat, "What do I know?", TestModel.toolUse("list_facts", "{}"), TestModel.text("done"));

		assertThat(offered()).contains("search", "list_applications")
				.doesNotContain("list_facts", "get_fact", "search_knowledge", "get_application_results", "add_fact", "add_story",
						"run_fit_check", "save_fit_check");
		assertThat(detail(chat).toString()).contains("That tool is not available in this Chat.");
		assertThat(detail(chat).path("proposals")).isEmpty();
	}

	@Test
	void aCareerChatOffersKnowledgeAndApplicationToolsOnlyWhileTheirSwitchesAreOn() throws Exception {
		var chat = chat(token, "{\"scope\":\"CAREER\"}");

		say(chat, "Hello", TestModel.text("ok"));
		assertThat(offered()).contains("list_facts", "search_knowledge", "add_fact", "add_story", "list_applications",
				"get_application_results").doesNotContain("search");

		var knowledgeOff = send(chat, "{\"text\":\"Hi\",\"useKnowledge\":false}", TestModel.text("ok")).body();
		assertThat(knowledgeOff).contains("event:done");
		assertThat(offered()).doesNotContain("list_facts", "search_knowledge", "add_fact", "add_story")
				.contains("list_applications");
		assertThat(detail(chat).path("useKnowledge").asBoolean()).isFalse();

		send(chat, "{\"text\":\"Hi again\",\"useApplications\":false}", TestModel.text("ok"));
		assertThat(offered()).doesNotContain("list_applications", "get_application", "get_application_results");
		assertThat(detail(chat).path("useApplications").asBoolean()).isFalse();
	}

	@Test
	void theKnowledgeSearchReturnsActiveFactsAndStoriesButNeverASwitchedOffOrAnotherUsersFact() throws Exception {
		var active = post("/api/knowledge/facts", token, "{\"text\":\"Led a team of four on payments\",\"category\":\"EXPERIENCE\"}");
		assertThat(active.statusCode()).as(active.body()).isEqualTo(201);
		var off = post("/api/knowledge/facts", token, "{\"text\":\"Switched off payments work\",\"category\":\"SKILL\"}");
		var offId = JSON.readTree(off.body()).path("id").asString();
		assertThat(put("/api/knowledge/facts/" + offId + "/status", token, "{\"status\":\"OFF\"}").statusCode()).isEqualTo(200);
		assertThat(post("/api/knowledge/facts", otherToken, "{\"text\":\"Another user's payments fact\",\"category\":\"SKILL\"}")
				.statusCode()).isEqualTo(201);
		assertThat(post("/api/knowledge/stories", token, "{\"title\":\"Payments outage\"}").statusCode()).isEqualTo(201);
		var chat = chat(token, "{\"scope\":\"CAREER\"}");

		say(chat, "Search", TestModel.toolUse("search_knowledge", "{\"query\":\"payments team\"}"), TestModel.text("done"));

		assertThat(lastSent()).contains("Led a team of four on payments", "Payments outage");
		assertThat(lastSent()).doesNotContain("Switched off payments work", "Another user's payments fact");
	}

	@Test
	void anApplicationChatSeesOnlyItsOwnApplication() throws Exception {
		var mine = application(token, "Mine Ltd");
		var other = application(token, "Other Ltd");
		var chat = chat(token, "{\"scope\":\"APPLICATION\",\"applicationId\":\"" + mine + "\"}");

		assertThat(say(chat, "Look", TestModel.text("ok"))).contains("event:done");
		assertThat(offered()).doesNotContain("list_applications").contains("get_application", "get_application_results");

		say(chat, "Other one", TestModel.toolUse("get_application", "{\"id\":\"" + other + "\"}"), TestModel.text("done"));
		assertThat(detail(chat).toString()).contains("That tool is not available in this Chat.");
		assertThat(lastSent()).doesNotContain("Other Ltd");

		say(chat, "Mine", TestModel.toolUse("get_application", "{\"id\":\"" + mine + "\"}"), TestModel.text("done"));
		assertThat(lastSent()).contains("Mine Ltd");
	}

}
