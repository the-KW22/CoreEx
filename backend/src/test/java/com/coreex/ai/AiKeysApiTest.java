package com.coreex.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;
import com.coreex.TestSupportConfiguration.TestClock;

import tools.jackson.databind.json.JsonMapper;

/**
 * A User's own AI settings (issue #203): the Chat model they pick, and their own key, which is write-only, checked on
 * save, encrypted and owner-scoped. A turn on their own key is not counted and not refused by the Shared key's switch
 * or budget.
 */
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01",
		"coreex.ai.key-secret=test-secret-for-the-vault-0123456789" })
class AiKeysApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	AiService ai;

	@Autowired
	TestClock clock;

	@Autowired
	TestModel testModel;

	private final String admin = TestJwts.tokenFor(UUID.randomUUID(), "owner@example.com");

	private UUID userId;

	private String user;

	private Instant startOfTest;

	@BeforeEach
	void setUp() throws Exception {
		startOfTest = clock.instant();
		testModel.clear();
		jdbc.sql("delete from users").update();
		assertThat(get("/api/me", admin).statusCode()).isEqualTo(200);
		userId = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'u@example.com', 'USER')").param("id", userId).update();
		user = TestJwts.tokenFor(userId, "u@example.com");
	}

	@AfterEach
	void restore() {
		jdbc.sql("update ai_settings set enabled = true, model = null, daily_budget_micro_usd = null").update();
		clock.advance(Duration.between(clock.instant(), startOfTest));
	}

	private static String keyBody(String key) {
		return "{\"provider\":\"anthropic\",\"key\":\"" + key + "\"}";
	}

	private long spentMicroUsd(UUID owner) {
		return jdbc.sql("select coalesce(sum(micro_usd), 0) from ai_usage where owner_id = :owner").param("owner", owner)
				.query(Long.class).single();
	}

	@Test
	void preferencesStartWithTheAdminsModelAndNoKey() throws Exception {
		var prefs = JSON.readTree(get("/api/ai/preferences", user).body());

		assertThat(prefs.path("model").asString()).isEqualTo("claude-opus-5-5");
		assertThat(prefs.path("key").isNull()).isTrue();
		assertThat(prefs.path("keysAvailable").asBoolean()).isTrue();
		assertThat(prefs.path("models")).hasSize(3);
		assertThat(prefs.path("models").get(0).path("inputUsdPerMillion").asDouble()).isEqualTo(4.0);
	}

	@Test
	void aUserPicksTheModelForTheirChatsAndAnUnknownModelIsRefused() throws Exception {
		var response = put("/api/ai/preferences/model", user, "{\"model\":\"claude-haiku-5-5\"}");

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		assertThat(JSON.readTree(get("/api/ai/preferences", user).body()).path("model").asString()).isEqualTo("claude-haiku-5-5");
		var unknown = put("/api/ai/preferences/model", user, "{\"model\":\"gpt-4\"}");
		assertThat(unknown.statusCode()).isEqualTo(400);
		assertThat(unknown.body()).contains("\"code\":\"UNKNOWN_MODEL\"");
	}

	@Test
	void aSavedKeyShowsOnlyItsProviderAndLastFourAndIsNotStoredInClear() throws Exception {
		var response = put("/api/ai/key", user, keyBody("sk-ant-test-1111"));

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		assertThat(response.body()).contains("\"provider\":\"anthropic\"").contains("\"last4\":\"1111\"")
				.doesNotContain("sk-ant-test");
		var stored = jdbc.sql("select key_ciphertext from user_ai_settings where owner_id = :owner").param("owner", userId)
				.query(byte[].class).single();
		assertThat(new String(stored, StandardCharsets.UTF_8)).doesNotContain("sk-ant-test");
		assertThat(JSON.readTree(get("/api/ai/preferences", user).body()).path("key").path("last4").asString()).isEqualTo("1111");
	}

	@Test
	void aSecondKeyReplacesTheFirst() throws Exception {
		put("/api/ai/key", user, keyBody("sk-ant-test-1111"));

		put("/api/ai/key", user, keyBody("sk-ant-test-2222"));

		assertThat(JSON.readTree(get("/api/ai/preferences", user).body()).path("key").path("last4").asString()).isEqualTo("2222");
	}

	@Test
	void aKeyTheProviderRefusesIsNotStoredAndTheAnswerDoesNotEchoIt() throws Exception {
		put("/api/ai/key", user, keyBody("sk-ant-test-1111"));

		var refused = put("/api/ai/key", user, keyBody("invalid"));

		assertThat(refused.statusCode()).isEqualTo(400);
		assertThat(refused.body()).contains("\"code\":\"KEY_REJECTED\"").doesNotContain("invalid");
		assertThat(JSON.readTree(get("/api/ai/preferences", user).body()).path("key").path("last4").asString()).isEqualTo("1111");
	}

	@Test
	void aKeyWithAnUnknownProviderIsRefused() throws Exception {
		var response = put("/api/ai/key", user, "{\"provider\":\"openai\",\"key\":\"sk-1234\"}");

		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.body()).contains("\"code\":\"UNKNOWN_PROVIDER\"");
	}

	@Test
	void theKeyIsDeletedAndTheChosenModelIsKept() throws Exception {
		put("/api/ai/preferences/model", user, "{\"model\":\"claude-haiku-5-5\"}");
		put("/api/ai/key", user, keyBody("sk-ant-test-1111"));

		assertThat(delete("/api/ai/key", user).statusCode()).isEqualTo(204);

		var prefs = JSON.readTree(get("/api/ai/preferences", user).body());
		assertThat(prefs.path("key").isNull()).isTrue();
		assertThat(prefs.path("model").asString()).isEqualTo("claude-haiku-5-5");
	}

	@Test
	void anotherUserNeverSeesOrChangesYourKey() throws Exception {
		put("/api/ai/key", user, keyBody("sk-ant-test-3333"));
		var other = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'o@example.com', 'USER')").param("id", other).update();
		var otherToken = TestJwts.tokenFor(other, "o@example.com");

		assertThat(JSON.readTree(get("/api/ai/preferences", otherToken).body()).path("key").isNull()).isTrue();
		assertThat(delete("/api/ai/key", otherToken).statusCode()).isEqualTo(204);
		assertThat(JSON.readTree(get("/api/ai/preferences", user).body()).path("key").path("last4").asString()).isEqualTo("3333");
	}

	@Test
	void aTurnOnYourOwnKeyIsNotCountedAndIsAllowedWhenTheBudgetIsSpentAndAIIsOff() throws Exception {
		var chat = JSON.readTree(post("/api/chats", user, null).body()).path("id").asString();
		ai.record(userId, 1_000_000, 0); // the Shared key's budget (0.01 dollars) is spent
		put("/api/admin/chat-settings", admin, "{\"enabled\":false,\"model\":\"claude-opus-5-5\",\"dailyBudgetUsd\":0.01}");
		put("/api/ai/key", user, keyBody("sk-ant-test-4444"));
		var spentBefore = spentMicroUsd(userId);
		testModel.script(TestModel.text("Hi from your own key"));

		assertThat(post("/api/chats/" + chat + "/messages", user, "{\"text\":\"Hi\"}").statusCode()).isEqualTo(200);

		assertThat(testModel.conversed()).hasSize(1); // the turn really ran, so its usage would have been counted
		assertThat(spentMicroUsd(userId)).isEqualTo(spentBefore);
		assertThat(JSON.readTree(get("/api/ai/usage", user).body()).path("ownKey").asBoolean()).isTrue();
		assertThat(JSON.readTree(get("/api/ai/usage", user).body()).path("available").asBoolean()).isTrue();

		// Without the key the Shared key is off and spent, so the same turn is refused.
		delete("/api/ai/key", user);
		var off = post("/api/chats/" + chat + "/messages", user, "{\"text\":\"Again\"}");
		assertThat(off.statusCode()).isEqualTo(503);
		assertThat(off.body()).contains("\"code\":\"AI_OFF\"");
		put("/api/admin/chat-settings", admin, "{\"enabled\":true,\"model\":\"claude-opus-5-5\",\"dailyBudgetUsd\":0.01}");
		var spent = post("/api/chats/" + chat + "/messages", user, "{\"text\":\"Again\"}");
		assertThat(spent.statusCode()).isEqualTo(429);
		assertThat(spent.body()).contains("\"code\":\"AI_BUDGET_SPENT\"");
	}

}
