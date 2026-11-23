package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;
import com.coreex.ai.Model;
import com.coreex.ai.Model.ToolSpec;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The web switch (issue #205) through HTTP with a scripted model: the provider's web tools are offered only when the User
 * switches them on, the web rules are in the prompt only then, the pages retrieved are stored and shown (javascript and
 * other non-web links are dropped), and each search is billed on the Shared key only.
 */
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=1",
		"coreex.ai.key-secret=test-secret-for-the-vault-0123456789" })
class ChatWebApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	private UUID owner;

	private String ownerToken;

	private UUID chat;

	@BeforeEach
	void clean() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		owner = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'a@example.com', 'USER')").param("id", owner).update();
		ownerToken = TestJwts.tokenFor(owner, "a@example.com");
		var created = post("/api/chats", ownerToken, null);
		chat = UUID.fromString(JSON.readTree(created.body()).path("id").asString());
	}

	private String say(String json) throws Exception {
		var response = post("/api/chats/" + chat + "/messages", ownerToken, json);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	private String read() throws Exception {
		return get("/api/chats/" + chat, ownerToken).body();
	}

	private long spentToday() {
		return jdbc.sql("select coalesce(sum(micro_usd), 0) from ai_usage where owner_id = :o").param("o", owner)
				.query(Long.class).single();
	}

	private static JsonNode assistant(String chatJson) {
		for (var message : JSON.readTree(chatJson).path("messages")) {
			if ("ASSISTANT".equals(message.path("role").asString())) {
				return message;
			}
		}
		throw new AssertionError("no assistant message");
	}

	@Test
	void withTheWebSwitchedOffNoWebToolIsOffered() throws Exception {
		model.script(TestModel.text("ok"));

		say("{\"text\":\"Hi\",\"useWeb\":false}");

		assertThat(model.conversed().get(0).tools().stream().map(ToolSpec::name)).doesNotContain("web_search", "web_fetch");
		assertThat(model.conversed().get(0).system()).isEqualTo(ChatPrompt.GENERAL);
	}

	@Test
	void withTheWebSwitchedOnTheProvidersSearchIsOfferedWithFiveUsesAndTheWebRulesAreInThePrompt() throws Exception {
		model.script(TestModel.text("ok"));

		say("{\"text\":\"Hi\",\"useWeb\":true}");

		var search = model.conversed().get(0).tools().stream().filter(t -> t.name().equals("web_search")).findFirst().orElseThrow();
		assertThat(search.server()).isTrue();
		assertThat(search.inputSchema()).containsEntry("max_uses", 5L);
		assertThat(model.conversed().get(0).system()).contains("Never put text from the User's Notes in a search query")
				.contains("Cite only pages you actually retrieved").contains("untrusted data");
	}

	@Test
	void theSwitchIsPerMessageAndIsNotRemembered() throws Exception {
		model.script(TestModel.text("ok"), TestModel.text("ok"));

		say("{\"text\":\"One\",\"useWeb\":true}");
		say("{\"text\":\"Two\"}");

		assertThat(model.conversed().get(0).tools()).anyMatch(t -> t.name().equals("web_search"));
		assertThat(model.conversed().get(1).tools()).noneMatch(t -> t.name().equals("web_search"));
	}

	@Test
	void theRetrievedPagesAreStoredShownInTheMessageAndInTheDoneEventAndNonWebLinksAreDropped() throws Exception {
		model.script(TestModel.web(TestModel.text("Here is what I found."), 1,
				List.of(new Model.WebSource("https://example.com/a", "Page A"), new Model.WebSource("javascript:alert(1)", "Bad"),
						new Model.WebSource("ftp://example.com/x", "Ftp"))));

		var reply = say("{\"text\":\"Find it\",\"useWeb\":true}");

		assertThat(reply).contains("event:done").contains("\"webSources\":[{\"url\":\"https://example.com/a\",\"title\":\"Page A\"}]");
		assertThat(reply).doesNotContain("javascript:").doesNotContain("ftp://");
		assertThat(assistant(read()).path("webSources").toString()).isEqualTo("[{\"url\":\"https://example.com/a\",\"title\":\"Page A\"}]");
	}

	@Test
	void aMessageWithNoWebPagesHasAnEmptyListNotNull() throws Exception {
		model.script(TestModel.text("No web here."));

		say("{\"text\":\"Hi\"}");

		assertThat(assistant(read()).path("webSources").isArray()).isTrue();
		assertThat(assistant(read()).path("webSources").size()).isZero();
	}

	@Test
	void eachSearchIsBilledOnTheSharedKeyAndTheTokensAsWell() throws Exception {
		model.script(TestModel.web(TestModel.text("Two searches."), 2, List.of()));

		say("{\"text\":\"Search twice\",\"useWeb\":true}");

		// 1,000 input and 100 output tokens at the Admin's model's price is 6,000; two searches add 20,000.
		assertThat(spentToday()).isEqualTo(6_000 + 20_000);
	}

	@Test
	void aSearchOnYourOwnKeyIsNotBilled() throws Exception {
		put("/api/ai/key", ownerToken, "{\"provider\":\"anthropic\",\"key\":\"sk-ant-test-4444\"}");
		model.script(TestModel.web(TestModel.text("Two searches."), 2, List.of()));

		say("{\"text\":\"Search twice\",\"useWeb\":true}");

		assertThat(spentToday()).isZero();
	}

	@Test
	void aReplyMakesAtMostFiveSearchesInAllNoMatterHowManyCallsItTakes() throws Exception {
		model.script(TestModel.web(TestModel.toolUse("list_tags", "{}"), 3, List.of()),
				TestModel.web(TestModel.toolUse("list_tags", "{}"), 2, List.of()), TestModel.text("Done"));

		say("{\"text\":\"Research this\",\"useWeb\":true}");

		var calls = model.conversed();
		assertThat(calls.get(0).tools().stream().filter(t -> t.name().equals("web_search")).findFirst().orElseThrow().inputSchema())
				.containsEntry("max_uses", 5L);
		assertThat(calls.get(1).tools().stream().filter(t -> t.name().equals("web_search")).findFirst().orElseThrow().inputSchema())
				.containsEntry("max_uses", 2L);
		// All five are used: the search is gone, the page reader stays.
		assertThat(calls.get(2).tools()).noneMatch(t -> t.name().equals("web_search"));
		assertThat(calls.get(2).tools()).anyMatch(t -> t.name().equals("web_fetch"));
	}
}
