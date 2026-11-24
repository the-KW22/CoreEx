package com.coreex.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestSupportConfiguration.TestClock;

import tools.jackson.databind.json.JsonMapper;

/**
 * The Admin Chat card and the usage bar (issues #385 and #386): the Shared key's switch, model and Daily AI budget are
 * stored, read on every call and so take effect at once, for Chat and Career alike; only an Admin can change them; a User
 * sees only their own spending.
 */
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01" })
class AiSettingsApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	AiService ai;

	@Autowired
	TestClock clock;

	private final String admin = TestJwts.tokenFor(UUID.randomUUID(), "owner@example.com");

	private UUID userId;

	private String user;

	private Instant startOfTest;

	@BeforeEach
	void setUp() throws Exception {
		startOfTest = clock.instant();
		jdbc.sql("delete from users").update();
		assertThat(get("/api/me", admin).statusCode()).isEqualTo(200); // the owner is provisioned as the Admin
		userId = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'u@example.com', 'USER')").param("id", userId).update();
		user = TestJwts.tokenFor(userId, "u@example.com");
	}

	/** The settings row and the shared clock outlive a test, so each puts them back, even when it fails. */
	@AfterEach
	void restore() {
		jdbc.sql("update ai_settings set enabled = true, model = null, daily_budget_micro_usd = null").update();
		clock.advance(Duration.between(clock.instant(), startOfTest));
	}

	private String body(boolean enabled, String model, double budget) {
		return "{\"enabled\":" + enabled + ",\"model\":\"" + model + "\",\"dailyBudgetUsd\":" + budget + "}";
	}

	@Test
	void theCardStartsOnWithOpusAndTheConfiguredBudgetAndListsTheModelsWithPrices() throws Exception {
		var response = get("/api/admin/chat-settings", admin);

		assertThat(response.statusCode()).isEqualTo(200);
		var settings = JSON.readTree(response.body());
		assertThat(settings.path("enabled").asBoolean()).isTrue();
		assertThat(settings.path("model").asString()).isEqualTo("claude-opus-5-5");
		assertThat(settings.path("dailyBudgetUsd").asDouble()).isEqualTo(0.01);
		assertThat(settings.path("keyConfigured").asBoolean()).isTrue();
		assertThat(settings.path("models")).hasSize(3);
		assertThat(settings.path("models").get(0).path("inputUsdPerMillion").asDouble()).isEqualTo(4.0);
		assertThat(settings.path("models").get(0).path("outputUsdPerMillion").asDouble()).isEqualTo(20.0);
	}

	@Test
	void onlyAnAdminCanReadOrChangeThem() throws Exception {
		assertThat(get("/api/admin/chat-settings", user).statusCode()).isEqualTo(403);
		assertThat(put("/api/admin/chat-settings", user, body(false, "claude-opus-5-5", 1)).statusCode()).isEqualTo(403);
		assertThat(get("/api/admin/chat-settings", admin).body()).contains("\"enabled\":true");
	}

	@Test
	void anAdminChangesThemAndTheyAreKept() throws Exception {
		var response = put("/api/admin/chat-settings", admin, body(true, "claude-haiku-5-5", 2.5));

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		var settings = JSON.readTree(get("/api/admin/chat-settings", admin).body());
		assertThat(settings.path("model").asString()).isEqualTo("claude-haiku-5-5");
		assertThat(settings.path("dailyBudgetUsd").asDouble()).isEqualTo(2.5);
	}

	@Test
	void aModelOutsideTheListOrABudgetOutsideTheRangeIsRefusedAndNothingChanges() throws Exception {
		assertThat(put("/api/admin/chat-settings", admin, body(true, "gpt-4", 1)).statusCode()).isEqualTo(400);
		assertThat(put("/api/admin/chat-settings", admin, body(true, "claude-opus-5-5", 101)).statusCode()).isEqualTo(400);
		assertThat(put("/api/admin/chat-settings", admin, body(true, "claude-opus-5-5", -1)).statusCode()).isEqualTo(400);
		assertThat(put("/api/admin/chat-settings", admin, "{\"enabled\":false}").statusCode()).isEqualTo(400);

		var settings = JSON.readTree(get("/api/admin/chat-settings", admin).body());
		assertThat(settings.path("enabled").asBoolean()).isTrue();
		assertThat(settings.path("dailyBudgetUsd").asDouble()).isEqualTo(0.01);
	}

	@Test
	void switchingTheKeyOffRefusesChatAndCareerAtOnceAndOnAgainRestoresThem() throws Exception {
		var chat = JSON.readTree(post("/api/chats", user, null).body()).path("id").asString();
		assertThat(post("/api/chats/" + chat + "/messages", user, "{\"text\":\"Hi\"}").statusCode()).isEqualTo(200);

		assertThat(put("/api/admin/chat-settings", admin, body(false, "claude-opus-5-5", 1)).statusCode()).isEqualTo(200);

		var refused = post("/api/chats/" + chat + "/messages", user, "{\"text\":\"Again\"}");
		assertThat(refused.statusCode()).isEqualTo(503);
		assertThat(refused.body()).contains("\"code\":\"AI_OFF\"");
		var career = post("/api/resumes/ai-import", user, "{\"text\":\"Jo Doe, engineer\"}");
		assertThat(career.statusCode()).isEqualTo(503);
		assertThat(career.body()).contains("\"code\":\"AI_OFF\"");
		assertThat(get("/api/ai/status", user).body()).contains("\"available\":false");
		assertThat(get("/api/ai/usage", user).body()).contains("\"available\":false");
		// A saved Chat stays readable while AI is off.
		assertThat(get("/api/chats/" + chat, user).statusCode()).isEqualTo(200);

		put("/api/admin/chat-settings", admin, body(true, "claude-opus-5-5", 1));
		assertThat(get("/api/ai/status", user).body()).contains("\"available\":true");
	}

	@Test
	void aNewBudgetAppliesToTheNextCallAtOnce() throws Exception {
		var chat = JSON.readTree(post("/api/chats", user, null).body()).path("id").asString();

		put("/api/admin/chat-settings", admin, body(true, "claude-opus-5-5", 0));

		var refused = post("/api/chats/" + chat + "/messages", user, "{\"text\":\"Hi\"}");
		assertThat(refused.statusCode()).isEqualTo(429);
		assertThat(refused.body()).contains("\"code\":\"AI_BUDGET_SPENT\"");
	}

	@Test
	void aCallIsCountedAtTheChosenModelsPrices() throws Exception {
		assertThat(ai.costMicroUsd(1_000_000, 1_000_000)).isEqualTo(24_000_000L); // Opus 5.5: $4 in, $20 out

		put("/api/admin/chat-settings", admin, body(true, "claude-haiku-5-5", 1));

		assertThat(ai.costMicroUsd(1_000_000, 1_000_000)).isEqualTo(600_000L); // Haiku 5.5: $0.10 in, $0.50 out
	}

	@Test
	void usageShowsOnlyTheUsersOwnSpendingTheBudgetAndWhenItStartsAgain() throws Exception {
		var other = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'o@example.com', 'USER')").param("id", other).update();
		ai.record(userId, 1_000, 0, 0); // 1,000 input tokens at $4 per million: 0.004 dollars
		ai.record(other, 2_000, 0, 0);

		var usage = JSON.readTree(get("/api/ai/usage", user).body());

		assertThat(usage.path("spentUsd").asDouble()).isEqualTo(0.004);
		assertThat(usage.path("budgetUsd").asDouble()).isEqualTo(0.01);
		assertThat(usage.path("available").asBoolean()).isTrue();
		var nextMidnight = clock.instant().atZone(ZoneOffset.UTC).toLocalDate().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
		assertThat(Instant.parse(usage.path("resetsAt").asString())).isEqualTo(nextMidnight);
	}

	@Test
	void usageStartsAgainAtMidnightUtc() throws Exception {
		ai.record(userId, 1_000, 0, 0);
		assertThat(JSON.readTree(get("/api/ai/usage", user).body()).path("spentUsd").asDouble()).isGreaterThan(0);

		clock.advance(Duration.ofHours(25));

		assertThat(JSON.readTree(get("/api/ai/usage", user).body()).path("spentUsd").asDouble()).isEqualTo(0);
	}

}
