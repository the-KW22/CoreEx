package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
import com.coreex.TestStorage;
import com.coreex.ai.Model;
import com.coreex.ai.Model.ContentBlock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The read_asset tool (issue #204) through HTTP with a scripted model: an image or PDF the User owns is read and sent to the
 * model as a block, its bytes are never stored, the Asset is a source, and the refusals are the ones the model is shown.
 */
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=1" })
class ChatReadAssetApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G' };

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	@Autowired
	TestStorage storage;

	private UUID owner;

	private String ownerToken;

	private UUID other;

	private String otherToken;

	private UUID chat;

	@BeforeEach
	void clean() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		storage.clear();
		owner = person("a@example.com");
		other = person("b@example.com");
		ownerToken = TestJwts.tokenFor(owner, "a@example.com");
		otherToken = TestJwts.tokenFor(other, "b@example.com");
		var created = post("/api/chats", ownerToken, null);
		chat = UUID.fromString(JSON.readTree(created.body()).path("id").asString());
	}

	private UUID person(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email).update();
		return id;
	}

	/** An Asset of a User with its file in Storage; size is what the row says, the bytes are what Storage holds. */
	private UUID asset(UUID user, String title, String mime, byte[] bytes, long size, boolean trashed) {
		var key = user + "/" + UUID.randomUUID();
		storage.putBytes(key, bytes, mime);
		var id = jdbc.sql("insert into items (owner_id, type, title, deleted_at) values (:owner, 'ASSET', :title, "
				+ (trashed ? "now()" : "null") + ") returning id").param("owner", user).param("title", title)
				.query(UUID.class).single();
		jdbc.sql("insert into asset_files (item_id, storage_key, mime_type, size_bytes) values (:id, :key, :mime, :size)")
				.param("id", id).param("key", key).param("mime", mime).param("size", size).update();
		return id;
	}

	private String read(String token) throws Exception {
		var response = get("/api/chats/" + chat, token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	private void say(String text, String json) throws Exception {
		var response = post("/api/chats/" + chat + "/messages", ownerToken, json == null ? "{\"text\":\"" + text + "\"}" : json);
		assertThat(response.body()).contains("event:done");
	}

	/** The tool results of the stored Chat, in order. */
	private static List<JsonNode> toolResults(String chatJson) {
		var results = new ArrayList<JsonNode>();
		JSON.readTree(chatJson).path("messages").forEach(message -> message.path("blocks").forEach(block -> {
			if ("tool_result".equals(block.path("type").asString())) {
				results.add(block);
			}
		}));
		return results;
	}

	/** The first tool result the model was sent in one call, with the file it carried (null when there is none). */
	private ContentBlock.ToolResult resultSent(int call) {
		for (var message : model.conversed().get(call).messages()) {
			for (var block : message.blocks()) {
				if (block instanceof ContentBlock.ToolResult result) {
					return result;
				}
			}
		}
		return null;
	}

	@Test
	void theModelReadsAnImageTheStoredMessageHoldsOnlyItsIdAndTheSecondTurnLoadsItAgain() throws Exception {
		var id = asset(owner, "Receipt.png", "image/png", PNG, PNG.length, false);
		model.script(TestModel.toolUse("read_asset", "{\"id\":\"" + id + "\"}"), TestModel.text("I read the file."));

		say("Look at my receipt", null);

		var sent = resultSent(1);
		assertThat(sent.data()).isEqualTo(PNG);
		assertThat(sent.mediaType()).isEqualTo("image/png");
		var stored = read(ownerToken);
		var result = toolResults(stored).get(0);
		assertThat(result.path("assetId").asString()).isEqualTo(id.toString());
		assertThat(result.path("isError").asBoolean()).isFalse();
		assertThat(stored).doesNotContain("data\":\"");
		var sources = JSON.readTree(stored).path("messages");
		assertThat(sources.toString()).contains("\"type\":\"ASSET\"").contains(id.toString());

		model.script(TestModel.text("Still there"));
		say("And again", null);
		var again = resultSent(2);
		assertThat(again.data()).isEqualTo(PNG);
		assertThat(again.assetId()).isEqualTo(id);
	}

	@Test
	void anotherUsersAssetAndATrashedAssetAreNotFound() throws Exception {
		var theirs = asset(other, "Theirs.png", "image/png", PNG, PNG.length, false);
		var trashed = asset(owner, "Old.png", "image/png", PNG, PNG.length, true);
		model.script(TestModel.toolUse("read_asset", "{\"id\":\"" + theirs + "\"}"),
				TestModel.toolUse("read_asset", "{\"id\":\"" + trashed + "\"}"), TestModel.text("done"));

		say("Read both", null);

		var results = toolResults(read(ownerToken));
		assertThat(results).hasSize(2);
		assertThat(results).allSatisfy(r -> {
			assertThat(r.path("isError").asBoolean()).isTrue();
			assertThat(r.path("content").asString()).isEqualTo("There is no such Asset.");
		});
	}

	@Test
	void aFileOverFiveMegabytesAndATextFileAreRefusedWithTheWordsTheModelIsShown() throws Exception {
		var big = asset(owner, "Scan.png", "image/png", PNG, 6 * 1024 * 1024L, false);
		var text = asset(owner, "notes.txt", "text/plain", "hi".getBytes(StandardCharsets.UTF_8), 2, false);
		model.script(TestModel.toolUse("read_asset", "{\"id\":\"" + big + "\"}"),
				TestModel.toolUse("read_asset", "{\"id\":\"" + text + "\"}"), TestModel.text("done"));

		say("Read these", null);

		var results = toolResults(read(ownerToken));
		assertThat(results.get(0).path("content").asString()).isEqualTo("That file is too large to read.");
		assertThat(results.get(1).path("content").asString()).isEqualTo("Chat can read images and PDFs only.");
		assertThat(results).allSatisfy(r -> assertThat(r.path("isError").asBoolean()).isTrue());
	}

	@Test
	void aPdfOfMoreThanTwentyPagesIsRefused() throws Exception {
		var pages = "%PDF-1.4\n" + "3 0 obj << /Type /Page >> endobj\n".repeat(21);
		var pdf = asset(owner, "Book.pdf", "application/pdf", pages.getBytes(StandardCharsets.ISO_8859_1), pages.length(), false);
		model.script(TestModel.toolUse("read_asset", "{\"id\":\"" + pdf + "\"}"), TestModel.text("done"));

		say("Read the book", null);

		assertThat(toolResults(read(ownerToken)).get(0).path("content").asString()).isEqualTo("That file is too large to read.");
	}

	@Test
	void aFileTrashedAfterItWasReadIsSentAsNoLongerAvailable() throws Exception {
		var id = asset(owner, "Receipt.png", "image/png", PNG, PNG.length, false);
		model.script(TestModel.toolUse("read_asset", "{\"id\":\"" + id + "\"}"), TestModel.text("I read the file."));
		say("Look", null);
		jdbc.sql("update items set deleted_at = now(), trash_batch_id = gen_random_uuid() where id = :id").param("id", id).update();

		model.script(TestModel.text("Noted"));
		say("Still?", null);

		var sent = resultSent(2);
		assertThat(sent).isNotNull();
		assertThat(sent.content()).isEqualTo("The file is no longer available.");
		assertThat(sent.data()).isNull();
	}

	@Test
	void theToolIsNotOfferedWhenUseMyNotesIsOff() throws Exception {
		model.script(TestModel.text("ok"));

		post("/api/chats/" + chat + "/messages", ownerToken, "{\"text\":\"Hi\",\"useNotes\":false}");

		assertThat(model.conversed().get(0).tools().stream().map(Model.ToolSpec::name)).doesNotContain("read_asset");
	}

	@Test
	void theToolIsOfferedWithTheNotesOn() throws Exception {
		model.script(TestModel.text("ok"));

		say("Hi", null);

		assertThat(model.conversed().get(0).tools().stream().map(Model.ToolSpec::name)).contains("read_asset");
	}

	@Test
	void onlyTheNewestThreeFilesAreSentAgainSoALongChatStaysUnderTheRequestLimit() throws Exception {
		var ids = new ArrayList<UUID>();
		for (var i = 0; i < 4; i++) {
			ids.add(asset(owner, "File" + i + ".png", "image/png", PNG, PNG.length, false));
			model.script(TestModel.toolUse("read_asset", "{\"id\":\"" + ids.get(i) + "\"}"), TestModel.text("read " + i));
			say("Read file " + i, null);
		}
		model.script(TestModel.text("Done"));
		say("Anything else?", null);

		var results = new ArrayList<ContentBlock.ToolResult>();
		for (var message : model.conversed().get(model.conversed().size() - 1).messages()) {
			for (var block : message.blocks()) {
				if (block instanceof ContentBlock.ToolResult result && result.assetId() != null) {
					results.add(result);
				}
			}
		}
		assertThat(results).hasSize(4);
		assertThat(results.get(0).data()).isNull();
		assertThat(results.get(0).content()).contains("not attached again");
		assertThat(results.subList(1, 4)).allSatisfy(result -> assertThat(result.data()).isEqualTo(PNG));
	}
}
