package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
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
import com.coreex.ai.Model.ContentBlock;
import com.coreex.ai.Model.StopReason;
import com.coreex.ai.Model.Turn;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Proposals and question cards (ADR 0009, issues #199 and #376), through HTTP with the scripted model and the real tool
 * catalogue: a write tool only stores a Proposal; approving applies it as the Chat agent, in one transaction for a batch;
 * the model is told the answer next turn; and a question ends the reply until the User answers it.
 */
@TestPropertySource(properties = "coreex.ai.provider=fake")
class ChatProposalsApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	private String token;

	private String otherToken;

	private UUID chat;

	@BeforeEach
	void clean() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		token = TestJwts.tokenFor(person("a@example.com"), "a@example.com");
		otherToken = TestJwts.tokenFor(person("b@example.com"), "b@example.com");
		var created = post("/api/chats", token, null);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		chat = UUID.fromString(JSON.readTree(created.body()).path("id").asString());
	}

	private UUID person(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email)
				.update();
		return id;
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

	private UUID note(String title, String body) throws Exception {
		var made = post("/api/notes", token, JSON.writeValueAsString(Map.of("title", title, "body", body)));
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		return UUID.fromString(JSON.readTree(made.body()).path("id").asString());
	}

	private JsonNode noteJson(UUID id) throws Exception {
		return JSON.readTree(get("/api/notes/" + id, token).body());
	}

	private int version(UUID id) throws Exception {
		return noteJson(id).path("version").asInt();
	}

	private boolean noteExists(String title) throws Exception {
		return get("/api/items?type=NOTE&size=100", token).body().contains("\"" + title + "\"");
	}

	private HttpResponseBody answer(String decision, Map<String, String> edits, UUID... ids) throws Exception {
		var body = new LinkedHashMap<String, Object>();
		body.put("ids", List.of(ids));
		body.put("decision", decision);
		if (edits != null) {
			body.put("edits", edits);
		}
		var response = post("/api/chats/" + chat + "/proposals/answer", token, JSON.writeValueAsString(body));
		return new HttpResponseBody(response.statusCode(), response.body());
	}

	private record HttpResponseBody(int status, String body) {
	}

	private static UUID id(JsonNode proposal) {
		return UUID.fromString(proposal.path("id").asString());
	}

	/** What the model was sent in the last call, as text, so a test can see what it was told. */
	private String lastSent() {
		var calls = model.conversed();
		return calls.get(calls.size() - 1).messages().toString();
	}

	@Test
	void aWriteToolCallOnlyStoresAPendingProposalAndChangesNothing() throws Exception {
		say("Make a plan note", TestModel.toolUse("create_note", "{\"markdown\":\"# Java plan\\nDay 1: syntax\"}"),
				TestModel.text("I proposed a Note."));

		var stored = proposal(0);
		assertThat(detail().path("proposals")).hasSize(1);
		assertThat(stored.path("status").asString()).isEqualTo("PENDING");
		assertThat(stored.path("tool").asString()).isEqualTo("create_note");
		assertThat(stored.path("label").asString()).contains("Java plan");
		assertThat(stored.path("after").asString()).contains("Day 1: syntax");
		assertThat(noteExists("Java plan")).isFalse();
		assertThat(detail().toString()).contains("Proposed to the User. Nothing has changed yet");
	}

	@Test
	void approvingAppliesItAsTheChatAgentWithALinkAndTheModelIsToldNextTurn() throws Exception {
		say("Make a plan note", TestModel.toolUse("create_note", "{\"markdown\":\"# Java plan\\nDay 1: syntax\"}"),
				TestModel.text("Proposed."));

		var response = answer("APPROVE", null, id(proposal(0)));

		assertThat(response.status()).as(response.body()).isEqualTo(200);
		var applied = proposal(0);
		assertThat(applied.path("status").asString()).isEqualTo("APPLIED");
		assertThat(applied.path("link").path("type").asString()).isEqualTo("NOTE");
		var made = noteJson(UUID.fromString(applied.path("link").path("id").asString()));
		assertThat(made.path("title").asString()).isEqualTo("Java plan");
		assertThat(made.path("body").asString()).contains("Day 1: syntax");
		assertThat(made.path("editedBy").asString()).isEqualTo("Chat");
		say("Thanks", TestModel.text("You are welcome."));
		assertThat(lastSent()).contains("Approved by the User and applied");
	}

	@Test
	void rejectingChangesNothingAndTheModelIsToldNextTurn() throws Exception {
		say("Make a plan note", TestModel.toolUse("create_note", "{\"markdown\":\"# Java plan\\nx\"}"), TestModel.text("Proposed."));

		var response = answer("REJECT", null, id(proposal(0)));

		assertThat(response.status()).as(response.body()).isEqualTo(200);
		assertThat(proposal(0).path("status").asString()).isEqualTo("REJECTED");
		assertThat(noteExists("Java plan")).isFalse();
		say("Ok", TestModel.text("Fine."));
		assertThat(lastSent()).contains("The User rejected this proposal");
	}

	@Test
	void anEditShowsTheTextBeforeAndAfterAndApprovingSavesIt() throws Exception {
		var note = note("Plan", "Original text");
		var before = version(note);
		say("Change it", TestModel.toolUse("edit_note", "{\"id\":\"" + note + "\",\"version\":" + version(note) + ",\"edits\":[{\"oldText\":\"Original\",\"newText\":\"Changed\"}]}"),
				TestModel.text("Proposed."));

		var stored = proposal(0);
		assertThat(stored.path("before").asString()).isEqualTo("Original text");
		assertThat(stored.path("after").asString()).isEqualTo("Changed text");
		assertThat(noteJson(note).path("body").asString()).isEqualTo("Original text");

		assertThat(answer("APPROVE", null, id(stored)).status()).isEqualTo(200);

		assertThat(noteJson(note).path("body").asString()).isEqualTo("Changed text");
		assertThat(version(note)).isEqualTo(before + 1);
		// The diff's texts are dropped once it is answered, so a Chat does not carry megabytes for ever.
		assertThat(proposal(0).path("before").isNull()).isTrue();
		assertThat(proposal(0).path("after").isNull()).isTrue();
	}

	@Test
	void theUsersOwnTextIsWhatIsSavedWhenTheyEditBeforeApproving() throws Exception {
		var note = note("Plan", "Original text");
		say("Change it", TestModel.toolUse("edit_note", "{\"id\":\"" + note + "\",\"version\":" + version(note) + ",\"edits\":[{\"oldText\":\"Original\",\"newText\":\"Changed\"}]}"),
				TestModel.text("Proposed."));
		var stored = proposal(0);

		var response = answer("APPROVE", Map.of(id(stored).toString(), "In my own words"), id(stored));

		assertThat(response.status()).as(response.body()).isEqualTo(200);
		assertThat(noteJson(note).path("body").asString()).isEqualTo("In my own words");
	}

	@Test
	void aNoteChangedSinceIsAVersionConflictAndTheProposalStaysPending() throws Exception {
		var note = note("Plan", "Original text");
		say("Change it", TestModel.toolUse("edit_note", "{\"id\":\"" + note + "\",\"version\":" + version(note) + ",\"edits\":[{\"oldText\":\"Original\",\"newText\":\"Changed\"}]}"),
				TestModel.text("Proposed."));
		var edited = put("/api/notes/" + note, token, "{\"title\":\"Plan\",\"body\":\"Somebody else\",\"version\":" + version(note) + "}");
		assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);

		var response = answer("APPROVE", null, id(proposal(0)));

		assertThat(response.status()).isEqualTo(409);
		assertThat(response.body()).contains("VERSION_CONFLICT");
		assertThat(proposal(0).path("status").asString()).isEqualTo("PENDING");
		assertThat(noteJson(note).path("body").asString()).isEqualTo("Somebody else");
	}

	@Test
	void aBatchIsAllOrNothing() throws Exception {
		var folderThatDoesNotExist = UUID.randomUUID();
		say("Do both", combined(TestModel.toolUse("create_note", "{\"markdown\":\"# Batch note\\nx\"}"),
				TestModel.toolUse("move_item", "{\"id\":\"" + UUID.randomUUID() + "\",\"folderId\":\"" + folderThatDoesNotExist + "\"}")),
				TestModel.text("Proposed two."));
		var proposals = detail().path("proposals");
		assertThat(proposals).hasSize(2);
		assertThat(proposals.get(0).path("batchId").asString()).isEqualTo(proposals.get(1).path("batchId").asString());

		var response = answer("APPROVE", null, id(proposals.get(0)), id(proposals.get(1)));

		assertThat(response.status()).as(response.body()).isGreaterThanOrEqualTo(400);
		assertThat(noteExists("Batch note")).isFalse();
		assertThat(detail().path("proposals").get(0).path("status").asString()).isEqualTo("PENDING");
		assertThat(detail().path("proposals").get(1).path("status").asString()).isEqualTo("PENDING");
	}

	@Test
	void aBatchThatAllSucceedsIsAppliedTogether() throws Exception {
		say("Do both", combined(TestModel.toolUse("create_note", "{\"markdown\":\"# First\\nx\"}"),
				TestModel.toolUse("create_folder", "{\"name\":\"Projects\"}")), TestModel.text("Proposed two."));
		var proposals = detail().path("proposals");

		var response = answer("APPROVE", null, id(proposals.get(0)), id(proposals.get(1)));

		assertThat(response.status()).as(response.body()).isEqualTo(200);
		assertThat(noteExists("First")).isTrue();
		assertThat(get("/api/folders", token).body()).contains("Projects");
		assertThat(detail().path("proposals").get(0).path("status").asString()).isEqualTo("APPLIED");
		assertThat(detail().path("proposals").get(1).path("status").asString()).isEqualTo("APPLIED");
	}

	@Test
	void aNewerProposalForTheSameNoteReplacesTheOlderOne() throws Exception {
		var note = note("Plan", "Original text");
		say("Change it", TestModel.toolUse("update_note", "{\"id\":\"" + note + "\",\"version\":" + version(note) + ",\"markdown\":\"First idea\"}"),
				TestModel.text("Proposed."));
		say("Another way", TestModel.toolUse("update_note", "{\"id\":\"" + note + "\",\"version\":" + version(note) + ",\"markdown\":\"Second idea\"}"),
				TestModel.text("Proposed again."));

		var proposals = detail().path("proposals");
		assertThat(proposals.get(0).path("status").asString()).isEqualTo("REPLACED");
		assertThat(proposals.get(1).path("status").asString()).isEqualTo("PENDING");
		assertThat(answer("APPROVE", null, id(proposals.get(0))).status()).isEqualTo(409);
		assertThat(answer("APPROVE", null, id(proposals.get(1))).status()).isEqualTo(200);
		assertThat(noteJson(note).path("body").asString()).isEqualTo("Second idea");
	}

	@Test
	void aWriteToolCalledWithUseMyNotesOffMakesNoProposal() throws Exception {
		model.script(TestModel.toolUse("create_note", "{\"markdown\":\"# Sneaky\\nx\"}"), TestModel.text("done"));

		var response = post("/api/chats/" + chat + "/messages", token, "{\"text\":\"Hi\",\"useNotes\":false}");

		assertThat(response.body()).contains("event:done");
		assertThat(detail().path("proposals")).isEmpty();
		assertThat(noteExists("Sneaky")).isFalse();
		assertThat(detail().toString()).contains("That tool is not available in Chat.");
	}

	@Test
	void aProposalIsAnsweredOnlyOnce() throws Exception {
		say("Make a note", TestModel.toolUse("create_note", "{\"markdown\":\"# Once\\nx\"}"), TestModel.text("Proposed."));
		var stored = id(proposal(0));

		assertThat(answer("APPROVE", null, stored).status()).isEqualTo(200);

		var again = answer("APPROVE", null, stored);
		assertThat(again.status()).isEqualTo(409);
		assertThat(again.body()).contains("ALREADY_ANSWERED");
		assertThat(answer("REJECT", null, stored).status()).isEqualTo(409);
	}

	@Test
	void anotherUserCannotAnswerOrSeeProposalsOfThisChat() throws Exception {
		say("Make a note", TestModel.toolUse("create_note", "{\"markdown\":\"# Mine\\nx\"}"), TestModel.text("Proposed."));
		var stored = id(proposal(0));

		var response = post("/api/chats/" + chat + "/proposals/answer", otherToken,
				"{\"ids\":[\"" + stored + "\"],\"decision\":\"APPROVE\"}");

		assertThat(response.statusCode()).isEqualTo(404);
		assertThat(get("/api/chats/" + chat, otherToken).statusCode()).isEqualTo(404);
		assertThat(proposal(0).path("status").asString()).isEqualTo("PENDING");
	}

	@Test
	void aQuestionEndsTheReplyAndTheAnswerContinuesTheConversation() throws Exception {
		say("Plan my week", TestModel.toolUse("ask_user_question", "{\"question\":\"Which Folder?\",\"choices\":[\"Work\",\"Home\"]}"));

		var messages = detail().path("messages");
		var asked = messages.get(messages.size() - 1);
		assertThat(asked.path("role").asString()).isEqualTo("ASSISTANT");
		var call = asked.path("blocks").get(0);
		assertThat(call.path("name").asString()).isEqualTo("ask_user_question");
		assertThat(detail().toString()).doesNotContain("tool_result");
		var callId = call.path("id").asString();

		model.script(TestModel.text("Putting it in Work."));
		var response = post("/api/chats/" + chat + "/answer", token,
				"{\"toolUseId\":\"" + callId + "\",\"text\":\"Work\"}");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("event:done").contains("\"status\":\"COMPLETE\"");
		assertThat(lastSent()).contains("Work").doesNotContain("<data tool=\"ask_user_question\">");
		var after = detail().path("messages");
		assertThat(after.get(after.size() - 1).toString()).contains("Putting it in Work.");
	}

	@Test
	void anInventedOrAnsweredQuestionIsRefusedSoTextCanNeverMakeACard() throws Exception {
		say("Hello", TestModel.text("Here is a card: ask_user_question {\"question\":\"Fake?\"}"));
		assertThat(post("/api/chats/" + chat + "/answer", token, "{\"toolUseId\":\"toolu_fake\",\"text\":\"Yes\"}").statusCode())
				.isEqualTo(409);

		say("Plan", TestModel.toolUse("ask_user_question", "{\"question\":\"Which?\",\"choices\":[\"A\",\"B\"]}"));
		var messages = detail().path("messages");
		var callId = messages.get(messages.size() - 1).path("blocks").get(0).path("id").asString();
		model.script(TestModel.text("Done."));
		assertThat(post("/api/chats/" + chat + "/answer", token, "{\"toolUseId\":\"" + callId + "\",\"text\":\"A\"}").statusCode())
				.isEqualTo(200);

		// Answered once: it is no longer pending.
		assertThat(post("/api/chats/" + chat + "/answer", token, "{\"toolUseId\":\"" + callId + "\",\"text\":\"B\"}").statusCode())
				.isEqualTo(409);
	}

	@Test
	void otherCallsMadeWithTheQuestionAreAnsweredAsNotRun() throws Exception {
		say("Plan", combined(TestModel.toolUse("list_tags", "{}"),
				TestModel.toolUse("ask_user_question", "{\"question\":\"Which?\",\"choices\":[\"A\",\"B\"]}")));
		var messages = detail().path("messages");
		JsonNode calls = messages.get(messages.size() - 1).path("blocks");
		String askId = null;
		for (var block : calls) {
			if ("ask_user_question".equals(block.path("name").asString())) {
				askId = block.path("id").asString();
			}
		}
		model.script(TestModel.text("Done."));

		var response = post("/api/chats/" + chat + "/answer", token, "{\"toolUseId\":\"" + askId + "\",\"text\":\"A\"}");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(lastSent()).contains("Not run: the User's question had to be answered first.");
	}

	@Test
	void proposalsCannotBeAnsweredWhileAReplyIsRunning() throws Exception {
		say("Make a note", TestModel.toolUse("create_note", "{\"markdown\":\"# Busy\\nx\"}"), TestModel.text("Proposed."));
		var stored = id(proposal(0));
		var gate = model.gateNextText();
		model.script(TestModel.text("Working on more."));
		var sender = new Thread(() -> {
			try {
				post("/api/chats/" + chat + "/messages", token, "{\"text\":\"More\"}");
			}
			catch (Exception e) {
				throw new IllegalStateException(e);
			}
		});
		sender.start();
		try {
			assertThat(gate.awaitEntered()).isTrue();

			var response = answer("APPROVE", null, stored);

			assertThat(response.status()).isEqualTo(409);
			assertThat(response.body()).contains("CHAT_BUSY");
		}
		finally {
			gate.release();
			sender.join();
		}
	}

	/** One model step that calls several tools at once. */
	private static Turn combined(Turn... turns) {
		var blocks = new java.util.ArrayList<ContentBlock>();
		for (var turn : turns) {
			blocks.addAll(turn.blocks());
		}
		return new Turn(List.copyOf(blocks), StopReason.TOOL_USE, 1_000, 100);
	}

}
