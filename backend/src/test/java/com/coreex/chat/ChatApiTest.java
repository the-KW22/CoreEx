package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;
import com.coreex.TestModel.Gate;
import com.coreex.TestSupportConfiguration.TestClock;
import com.coreex.ai.Model;
import com.coreex.ai.Model.Failure;

import tools.jackson.databind.json.JsonMapper;

/**
 * Chats (issue #380): saved conversations, the reply streamed over SSE, and the rules around them, through HTTP with a
 * scripted model. The budget is small so the budget rules are reached with a few cents.
 */
@Import(ScriptedChatTools.class)
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01" })
class ChatApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final LocalDate TODAY = LocalDate.of(2026, 10, 28);

	private record Who(UUID id, String token) {
	}

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	@Autowired
	TestClock clock;

	@Autowired
	ChatService chats;

	private Who owner;

	private Who other;

	private Who admin;

	@BeforeEach
	void clean() {
		jdbc.sql("delete from users").update();
		model.clear();
		owner = person("USER", "a@example.com");
		other = person("USER", "b@example.com");
		admin = person("ADMIN", "admin@example.com");
	}

	private Who person(String role, String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, :role)").param("id", id)
				.param("email", email).param("role", role).update();
		return new Who(id, TestJwts.tokenFor(id, email));
	}

	private static String json(String text) {
		return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
	}

	private static UUID idOf(String body) {
		var matcher = java.util.regex.Pattern.compile("\"id\":\"([^\"]+)\"").matcher(body);
		matcher.find();
		return UUID.fromString(matcher.group(1));
	}

	private UUID createChat(Who who) throws Exception {
		var created = post("/api/chats", who.token(), null);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return idOf(created.body());
	}

	private HttpResponse<String> say(Who who, UUID chat, String text) throws Exception {
		return post("/api/chats/" + chat + "/messages", who.token(), "{\"text\":" + json(text) + "}");
	}

	private CompletableFuture<HttpResponse<String>> sayAsync(Who who, UUID chat, String text) {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/chats/" + chat + "/messages"))
				.header("Content-Type", "application/json").header("Authorization", "Bearer " + who.token())
				.POST(HttpRequest.BodyPublishers.ofString("{\"text\":" + json(text) + "}")).build();
		return HttpClient.newHttpClient().sendAsync(request, HttpResponse.BodyHandlers.ofString());
	}

	@SuppressWarnings("unchecked")
	private static List<Map<String, Object>> messagesOf(String chatJson) {
		Map<String, Object> chat = JSON.readValue(chatJson, Map.class);
		return (List<Map<String, Object>>) chat.get("messages");
	}

	private String read(Who who, UUID chat) throws Exception {
		var response = get("/api/chats/" + chat, who.token());
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	private void setClaim(UUID chat, java.time.Instant when) {
		jdbc.sql("update chats set claimed_at = :when where id = :id").param("when", java.sql.Timestamp.from(when)).param("id", chat).update();
	}

	private void spend(Who who, long microUsd) {
		jdbc.sql("insert into ai_usage (owner_id, day, micro_usd) values (:o, :d, :m)").param("o", who.id())
				.param("d", TODAY).param("m", microUsd).update();
	}

	private long spentToday(Who who) {
		return jdbc.sql("select coalesce(sum(micro_usd), 0) from ai_usage where owner_id = :o").param("o", who.id())
				.query(Long.class).single();
	}

	private int countOf(String table) {
		return jdbc.sql("select count(*) from " + table).query(Integer.class).single();
	}

	@Test
	void aChatIsCreatedEmptyAndTitledNewChat() throws Exception {
		var chat = createChat(owner);

		var body = read(owner, chat);

		assertThat(body).contains("\"title\":\"New chat\"");
		assertThat(messagesOf(body)).isEmpty();
		assertThat(get("/api/chats", owner.token()).body()).contains(chat.toString());
	}

	@Test
	void chatsAreListedNewestUsedFirstAndOnlyForTheirOwner() throws Exception {
		var older = createChat(owner);
		var newer = createChat(owner);
		var someoneElses = createChat(other);
		model.script(TestModel.text("Hi"));
		clock.advance(Duration.ofMinutes(1));
		say(owner, older, "Hello"); // now the oldest one is the most recently used

		var list = get("/api/chats", owner.token()).body();

		assertThat(list.indexOf(older.toString())).isLessThan(list.indexOf(newer.toString()));
		assertThat(list).doesNotContain(someoneElses.toString());
		assertThat(get("/api/chats", other.token()).body()).contains(someoneElses.toString()).doesNotContain(older.toString());
	}

	@Test
	void anotherUserGets404ForSomeonesChatInEveryWay() throws Exception {
		var chat = createChat(owner);

		assertThat(get("/api/chats/" + chat, other.token()).statusCode()).isEqualTo(404);
		assertThat(say(other, chat, "Hi").statusCode()).isEqualTo(404);
		assertThat(post("/api/chats/" + chat + "/stop", other.token(), null).statusCode()).isEqualTo(404);
		var deleted = delete("/api/chats/" + chat, other.token());
		assertThat(deleted.statusCode()).isEqualTo(404);
		assertThat(deleted.body()).contains("\"code\":\"NOT_FOUND\"");
		assertThat(get("/api/chats/" + chat, owner.token()).statusCode()).isEqualTo(200);
	}

	@Test
	void anAdminGets404ForAnotherUsersChatAndDoesNotListIt() throws Exception {
		var chat = createChat(owner);

		var response = get("/api/chats/" + chat, admin.token());

		assertThat(response.statusCode()).isEqualTo(404);
		assertThat(response.body()).contains("\"code\":\"NOT_FOUND\"");
		assertThat(get("/api/chats", admin.token()).body()).doesNotContain(chat.toString());
		assertThat(delete("/api/chats/" + chat, admin.token()).statusCode()).isEqualTo(404);
	}

	@Test
	void deletingAChatDeletesItsMessagesToo() throws Exception {
		var chat = createChat(owner);
		model.script(TestModel.text("Hi back"));
		say(owner, chat, "Hi");
		assertThat(countOf("chat_messages")).isEqualTo(2);

		assertThat(delete("/api/chats/" + chat, owner.token()).statusCode()).isEqualTo(204);

		assertThat(get("/api/chats/" + chat, owner.token()).statusCode()).isEqualTo(404);
		assertThat(countOf("chat_messages")).isZero();
	}

	@Test
	void aPlainReplyStreamsTextAndDoneAndIsStoredWithItsTitle() throws Exception {
		var chat = createChat(owner);
		model.script(TestModel.text("Paris is the capital."));

		var response = say(owner, chat, "What is the capital of France?");

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
		assertThat(response.body()).contains("event:text").contains("\"text\":\"Paris is the capital.\"")
				.contains("event:done").contains("\"status\":\"COMPLETE\"");
		var body = read(owner, chat);
		assertThat(body).contains("\"title\":\"What is the capital of France?\"");
		var messages = messagesOf(body);
		assertThat(messages).hasSize(2);
		assertThat(messages.get(0)).containsEntry("role", "USER").containsEntry("status", "COMPLETE");
		assertThat(messages.get(1)).containsEntry("role", "ASSISTANT").containsEntry("status", "COMPLETE");
		assertThat(messages.get(1).get("blocks").toString()).contains("Paris is the capital.");
		assertThat(model.conversed().get(0).system()).contains("CoreEx");
		assertThat(model.conversed().get(0).messages()).hasSize(1);
	}

	@Test
	void theTitleIsTheFirstLineWithSpacesCollapsedAndCutAtSixtyCharacters() throws Exception {
		var chat = createChat(owner);
		model.script(TestModel.text("ok"));
		say(owner, chat, "  Plan   the trip\nthen book flights");
		var long1 = createChat(owner);
		model.script(TestModel.text("ok"));
		say(owner, long1, "a".repeat(70));

		assertThat(read(owner, chat)).contains("\"title\":\"Plan the trip\"");
		assertThat(read(owner, long1)).contains("\"title\":\"" + "a".repeat(60) + "…\"");
	}

	@Test
	void aToolUsingReplyStoresToolRowsSendsAToolEventAndReplaysTheResult() throws Exception {
		var chat = createChat(owner);
		model.script(TestModel.toolUse("echo", "{\"q\":\"x\"}"), TestModel.text("Done"));

		var response = say(owner, chat, "Use the tool");

		assertThat(response.body()).contains("event:tool").contains("\"name\":\"echo\"").contains("event:done");
		var messages = messagesOf(read(owner, chat));
		assertThat(messages).hasSize(4);
		assertThat(messages.get(1).get("blocks").toString()).contains("type=tool_use").contains("name=echo");
		assertThat(messages.get(2)).containsEntry("role", "USER");
		assertThat(messages.get(2).get("blocks").toString()).contains("type=tool_result").contains("echoed")
				.contains("isError=false");
		assertThat(messages.get(3).get("blocks").toString()).contains("Done");
		var secondCall = model.conversed().get(1).messages();
		assertThat(secondCall.get(secondCall.size() - 1).role()).isEqualTo(Model.Role.USER);
		assertThat(secondCall.get(secondCall.size() - 1).blocks().get(0)).isInstanceOf(Model.ContentBlock.ToolResult.class);
	}

	@Test
	void aToolThatFailsBecomesAnErrorResultWithoutAStackTraceAndTheReplyGoesOn() throws Exception {
		var chat = createChat(owner);
		model.script(TestModel.toolUse("boom", "{}"), TestModel.text("Sorry, that did not work."));

		var response = say(owner, chat, "Try it");

		assertThat(response.body()).contains("event:done").doesNotContain(ScriptedChatTools.BOOM_DETAIL);
		var body = read(owner, chat);
		assertThat(body).contains("\"isError\":true").doesNotContain(ScriptedChatTools.BOOM_DETAIL);
		assertThat(messagesOf(body)).hasSize(4);
	}

	@Test
	void aSecondSendWhileAReplyRunsIsRefusedWithChatBusy() throws Exception {
		var chat = createChat(owner);
		var gate = model.gateNextText();
		model.script(TestModel.text("Hello world"));
		var first = sayAsync(owner, chat, "First");
		assertThat(gate.awaitEntered()).isTrue();

		var second = say(owner, chat, "Second");

		assertThat(second.statusCode()).isEqualTo(409);
		assertThat(second.body()).contains("\"code\":\"CHAT_BUSY\"");
		gate.release();
		assertThat(first.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
		assertThat(messagesOf(read(owner, chat))).hasSize(2);
	}

	@Test
	void aClaimOlderThanFifteenMinutesIsReleasedButAYoungerOneStillRefuses() throws Exception {
		var chat = createChat(owner);
		setClaim(chat, clock.instant().minus(Duration.ofMinutes(14)));
		assertThat(say(owner, chat, "Hi").statusCode()).isEqualTo(409);

		setClaim(chat, clock.instant().minus(Duration.ofMinutes(16)));
		model.script(TestModel.text("Hello"));

		assertThat(say(owner, chat, "Hi").statusCode()).isEqualTo(200);
	}

	@Test
	void stopKeepsTheTextWrittenSoFarAndMarksTheMessageStopped() throws Exception {
		var chat = createChat(owner);
		var gate = model.gateNextText();
		model.script(TestModel.text("Part one. Part two."));
		var first = sayAsync(owner, chat, "Write it");
		assertThat(gate.awaitEntered()).isTrue();

		assertThat(post("/api/chats/" + chat + "/stop", owner.token(), null).statusCode()).isEqualTo(204);
		gate.release();

		var response = first.get(10, TimeUnit.SECONDS);
		assertThat(response.body()).contains("event:done").contains("\"status\":\"STOPPED\"");
		var messages = messagesOf(read(owner, chat));
		assertThat(messages).hasSize(2);
		assertThat(messages.get(1)).containsEntry("status", "STOPPED");
		assertThat(messages.get(1).get("blocks").toString()).contains("Part one.").doesNotContain("Part two");
	}

	@Test
	void stoppingWhenNothingRunsIsHarmless() throws Exception {
		var chat = createChat(owner);

		assertThat(post("/api/chats/" + chat + "/stop", owner.token(), null).statusCode()).isEqualTo(204);
	}

	@Test
	void closingTheStreamMidReplyStillFinishesAndStoresTheReply() throws Exception {
		var chat = createChat(owner);
		var gate = model.gateNextText();
		model.script(TestModel.text("Hello world"));
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/chats/" + chat + "/messages"))
				.header("Content-Type", "application/json").header("Authorization", "Bearer " + owner.token())
				.POST(HttpRequest.BodyPublishers.ofString("{\"text\":\"Say hello\"}")).build();
		var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofInputStream());
		assertThat(response.statusCode()).isEqualTo(200);
		var reply = chats.running(chat).orElseThrow();
		try (var lines = new BufferedReader(new InputStreamReader(response.body()))) {
			String line;
			var sawText = false;
			while ((line = lines.readLine()) != null && !sawText) {
				sawText = line.equals("event:text");
			}
			assertThat(sawText).isTrue();
		}

		gate.release();

		assertThat(reply.awaitEnd()).isTrue();
		var messages = messagesOf(read(owner, chat));
		assertThat(messages).hasSize(2);
		assertThat(messages.get(1)).containsEntry("status", "COMPLETE");
		assertThat(messages.get(1).get("blocks").toString()).contains("Hello world");
	}

	@Test
	void aSpentBudgetRefusesBeforeTheStreamWithAnswerThatItStartsAgainAtMidnight() throws Exception {
		var chat = createChat(owner);
		spend(owner, 10_000);

		var response = say(owner, chat, "Hi");

		assertThat(response.statusCode()).isEqualTo(429);
		assertThat(response.body()).contains("\"code\":\"AI_BUDGET_SPENT\"").contains("midnight UTC");
		assertThat(model.conversed()).isEmpty();
		assertThat(messagesOf(read(owner, chat))).isEmpty();
	}

	@Test
	void aReplyThatCrossesTheBudgetStillFinishesAndTheNextIsRefused() throws Exception {
		var chat = createChat(owner);
		spend(owner, 9_999);
		model.script(TestModel.text("Done anyway"));

		var crossing = say(owner, chat, "Hi");

		assertThat(crossing.statusCode()).isEqualTo(200);
		assertThat(crossing.body()).contains("\"status\":\"COMPLETE\"");
		assertThat(spentToday(owner)).isEqualTo(9_999 + 6_000);
		assertThat(say(owner, chat, "Again").statusCode()).isEqualTo(429);
	}

	@Test
	void eachCallIsCountedFromItsTokensAndTheModelsPrices() throws Exception {
		var chat = createChat(owner);
		model.script(TestModel.usage(TestModel.text("Hi"), 2_000, 300));

		say(owner, chat, "Hello");

		// 2000 input tokens at $4 per million and 300 output tokens at $20 per million: 8000 + 6000 millionths of a dollar.
		assertThat(spentToday(owner)).isEqualTo(14_000);
	}

	@Test
	void aProviderOutageSendsAnErrorEventAndStoresAFailedMessage() throws Exception {
		var chat = createChat(owner);
		model.setDown(true);

		var response = say(owner, chat, "Hi");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("event:error").contains("\"code\":\"AI_UNAVAILABLE\"").doesNotContain("event:done");
		var messages = messagesOf(read(owner, chat));
		assertThat(messages.get(1)).containsEntry("status", "FAILED").containsEntry("errorCode", "AI_UNAVAILABLE");
	}

	@Test
	void aProviderOutOfCreditSendsAnErrorEventWithItsOwnCode() throws Exception {
		var chat = createChat(owner);
		model.failWith(Failure.Kind.OUT_OF_CREDIT);

		var response = say(owner, chat, "Hi");

		assertThat(response.body()).contains("event:error").contains("\"code\":\"AI_OUT_OF_CREDIT\"");
		assertThat(messagesOf(read(owner, chat)).get(1)).containsEntry("errorCode", "AI_OUT_OF_CREDIT");
	}

	@Test
	void aTimeLimitHitAfterAToolStepEndsWithTheContinueNoteOnTheLastAnswer() throws Exception {
		var chat = createChat(owner);
		model.script(TestModel.toolUse("slow", "{}"), TestModel.text("never reached"));

		say(owner, chat, "Take your time");

		assertThat(model.conversed()).hasSize(1);
		var last = messagesOf(read(owner, chat)).get(1);
		assertThat(last.get("blocks").toString()).contains("Time limit reached. Ask me to continue.");
		assertThat(last).containsEntry("status", "COMPLETE");
		clock.advance(Duration.ofMinutes(-6));
	}

	@Test
	void sendingToAnUnknownChatIs404AndBlankTextIsRefused() throws Exception {
		assertThat(say(owner, UUID.randomUUID(), "Hi").statusCode()).isEqualTo(404);

		var chat = createChat(owner);
		var blank = post("/api/chats/" + chat + "/messages", owner.token(), "{\"text\":\"   \"}");
		assertThat(blank.statusCode()).isEqualTo(400);
		assertThat(blank.body()).contains("\"code\":\"INVALID_REQUEST\"");
	}

	@Test
	void aSendWithoutSignInIs401() throws Exception {
		assertThat(post("/api/chats", null, null).statusCode()).isEqualTo(401);
	}

}
