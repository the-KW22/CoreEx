package com.coreex.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestEmbedder;
import com.coreex.TestJwts;
import com.coreex.TestModel;
import com.coreex.ai.Model.ToolSpec;
import com.coreex.ai.Model.Turn;
import com.coreex.embeddings.Embedder;
import com.coreex.mcp.ToolCatalogue;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Chat's tools (ADR 0007, issue #381) through HTTP with a scripted model and the real {@link ChatToolbox}: which tools
 * are offered, that a write tool or the Trash is refused, that results belong to the caller, and the Chat-only search.
 */
@TestPropertySource(properties = "coreex.ai.provider=fake")
class ChatToolsApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** The read tools Chat offers: every read tool of the catalogue but list_trash, with Chat's own search. */
	private static final Set<String> READS = Set.of("search", "list_items", "get_item", "get_asset_url", "list_folders",
			"get_graph", "suggest_links", "list_tags", "list_applications", "get_application",
			"get_application_results", "list_facts", "get_fact", "list_cover_letters", "get_cover_letter", "list_resumes",
			"get_resume", "list_trash", "search_knowledge");

	/** The write tools the model may propose (never uploads; the Facts and Stories are the only Career writes), and the question tool. */
	private static final Set<String> PROPOSABLE = Set.of("create_note", "update_note", "edit_note", "update_asset",
			"create_folder", "rename_folder", "move_folder", "trash_folder", "create_tag", "rename_tag", "set_tag_colour",
			"set_tags", "move_item", "trash_item", "restore", "add_fact", "add_story");
	/** What a General Chat is offered: the Career tools that return Facts or results and the Career proposals are left out. */
	private static final Set<String> OFFERED = java.util.stream.Stream
			.of(READS.stream(), PROPOSABLE.stream(), java.util.stream.Stream.of("ask_user_question", "read_asset"))
			.flatMap(s -> s).filter(n -> !java.util.Set.of("list_facts", "get_fact", "search_knowledge", "get_application_results", "add_fact", "add_story").contains(n)).collect(java.util.stream.Collectors.toSet());

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestModel model;

	@Autowired
	TestEmbedder embedder;

	@Autowired
	ToolCatalogue catalogue;

	private String ownerToken;

	private UUID owner;

	private String otherToken;

	private UUID other;

	private UUID chat;

	@BeforeEach
	void clean() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		embedder.clear();
		owner = person("a@example.com");
		other = person("b@example.com");
		ownerToken = TestJwts.tokenFor(owner, "a@example.com");
		otherToken = TestJwts.tokenFor(other, "b@example.com");
		var created = post("/api/chats", ownerToken, null);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		chat = UUID.fromString(JSON.readTree(created.body()).path("id").asString());
	}

	private UUID person(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email)
				.update();
		return id;
	}

	/** Sends one message whose model turns are scripted, and returns the Chat as it is stored. */
	private String reply(String text, Turn... turns) throws Exception {
		model.script(turns);
		var response = post("/api/chats/" + chat + "/messages", ownerToken, "{\"text\":\"" + text + "\"}");
		assertThat(response.body()).contains("event:done");
		var stored = get("/api/chats/" + chat, ownerToken);
		assertThat(stored.statusCode()).isEqualTo(200);
		return stored.body();
	}

	/** The tool results of a Chat, in order: each has content and isError. */
	private static List<JsonNode> toolResults(String chatJson) {
		var results = new ArrayList<JsonNode>();
		JSON.readTree(chatJson).path("messages").forEach(message -> message.path("blocks").forEach(block -> {
			if ("tool_result".equals(block.path("type").asString())) {
				results.add(block);
			}
		}));
		return results;
	}

	private UUID note(String token, String title, String body) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"folderId\":null}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return UUID.fromString(JSON.readTree(created.body()).path("id").asString());
	}

	/** Stores a Chunk the way the sweep would: its text starts with the title and heading path, then a blank line. */
	private void chunk(UUID note, String content) {
		var vector = embedder.embed(List.of(content)).orElseThrow().get(0);
		jdbc.sql("""
				insert into note_chunks (owner_id, note_id, position, content, content_hash, model, embedding)
				select i.owner_id, i.id, 0, :content, :hash, 'gte-small', cast(:vector as halfvec)
				from items i where i.id = :note""").param("content", content).param("hash", UUID.randomUUID().toString())
				.param("vector", Embedder.literal(vector)).param("note", note).update();
	}

	@Test
	void theOfferedToolsAreTheReadToolsTheProposableWriteToolsAndTheQuestionWithObjectSchemas() throws Exception {
		reply("Hi", TestModel.text("ok"));

		var tools = model.conversed().get(0).tools();
		assertThat(tools.stream().map(ToolSpec::name)).containsExactlyInAnyOrderElementsOf(OFFERED);
		assertThat(tools).allSatisfy(tool -> assertThat(tool.inputSchema()).as(tool.name()).containsEntry("type", "object"));
		// The transport context is the caller, not an argument the model sends.
		assertThat(tools).allSatisfy(tool -> assertThat(tool.inputSchema().toString()).doesNotContain("context"));
		var search = tools.stream().filter(t -> t.name().equals("search")).findFirst().orElseThrow();
		var properties = (Map<?, ?>) search.inputSchema().get("properties");
		assertThat(properties.keySet().stream().map(Object::toString).toList()).containsExactly("query");
		assertThat(search.inputSchema().get("required")).isEqualTo(List.of("query"));
	}

	@Test
	void theCatalogueHoldsExactlyTheReadToolsSoNoWriteToolIsMarkedReadOnly() {
		assertThat(catalogue.specs().stream().map(ToolSpec::name)).containsExactlyInAnyOrderElementsOf(new HashSet<>(READS));
		assertThat(catalogue.writeSpecs().stream().map(ToolSpec::name)).containsExactlyInAnyOrderElementsOf(PROPOSABLE);
		assertThat(PROPOSABLE).doesNotContain("start_upload", "confirm_upload");
	}

	@Test
	void writeToolsOnlyMakeProposalsAndUnknownNamesAndBadEditsAreRefusedAndNothingChanges() throws Exception {
		var note = note(ownerToken, "Plan", "Original text");
		var id = "\"" + note + "\"";

		var stored = reply("Change it",
				TestModel.toolUse("edit_note", "{\"id\":" + id + ",\"oldText\":\"Original\",\"newText\":\"Changed\"}"),
				TestModel.toolUse("trash_item", "{\"id\":" + id + "}"), TestModel.toolUse("list_trash", "{}"),
				TestModel.toolUse("create_note", "{\"title\":\"New\",\"markdown\":\"x\"}"),
				TestModel.toolUse("start_upload", "{}"), TestModel.toolUse("no_such_tool", "{}"), TestModel.text("done"));

		var results = toolResults(stored);
		assertThat(results).hasSize(6);
		// A bad edit (no version) and the names that are not on the list are refused; a real write waits as a Proposal.
		assertThat(results.stream().map(r -> r.path("isError").asBoolean()).toList())
				.containsExactly(true, false, false, false, true, true);
		assertThat(results.get(1).path("content").asString()).contains("Proposed").contains("Nothing has changed");
		var after = get("/api/notes/" + note, ownerToken);
		assertThat(after.statusCode()).as(after.body()).isEqualTo(200);
		assertThat(after.body()).contains("Original text").doesNotContain("Changed");
		assertThat(get("/api/items?type=NOTE", ownerToken).body()).doesNotContain("\"New\"");
	}

	@Test
	void listingAndReadingOnlyShowTheCallersNotes() throws Exception {
		note(ownerToken, "Mine title", "Mine body");
		var theirs = note(otherToken, "Theirs title", "Theirs body");

		var stored = reply("What do I have", TestModel.toolUse("list_items", "{}"),
				TestModel.toolUse("get_item", "{\"id\":\"" + theirs + "\"}"), TestModel.text("done"));

		var results = toolResults(stored);
		assertThat(results.get(0).path("content").asString()).contains("Mine title").doesNotContain("Theirs title");
		assertThat(results.get(1).path("isError").asBoolean()).isTrue();
		assertThat(results.get(1).path("content").asString()).isEqualTo("There is no such Item.").doesNotContain("Theirs body");
	}

	@Test
	void searchReturnsTheClosestChunkWithItsTitleHeadingPathAndTextAndNeverAnotherUsers() throws Exception {
		var mine = note(ownerToken, "Garden plan", "We grow tomatoes near the fence.");
		chunk(mine, "Garden plan › Beds\n\ntomatoes");
		var theirs = note(otherToken, "Their garden", "Their tomatoes.");
		chunk(theirs, "Garden plan › Beds\n\ntomatoes");

		var stored = reply("Find my beds", TestModel.toolUse("search", "{\"query\":\"garden plan beds tomatoes\"}"),
				TestModel.text("done"));

		var found = JSON.readTree(toolResults(stored).get(0).path("content").asString()).path("chunks");
		assertThat(found).hasSize(1);
		var chunk = found.get(0);
		assertThat(chunk.path("id").asString()).isEqualTo(mine.toString());
		assertThat(chunk.path("type").asString()).isEqualTo("NOTE");
		assertThat(chunk.path("title").asString()).isEqualTo("Garden plan");
		assertThat(chunk.path("headingPath").asString()).isEqualTo("Beds");
		assertThat(chunk.path("text").asString()).isEqualTo("tomatoes");
		assertThat(chunk.path("similarity").asDouble()).isGreaterThan(0.79);
	}

	@Test
	void searchFallsBackToExactWordsWhenNothingIsEmbeddedAndAtMostEight() throws Exception {
		note(ownerToken, "Tomato plan", "We grow tomatoes near the fence.");
		note(otherToken, "Their plan", "Their tomatoes too.");
		for (var i = 0; i < 9; i++) {
			note(ownerToken, "Tomato note " + i, "more tomatoes " + i);
		}

		var stored = reply("Find tomatoes", TestModel.toolUse("search", "{\"query\":\"tomatoes\"}"), TestModel.text("done"));

		var found = JSON.readTree(toolResults(stored).get(0).path("content").asString()).path("chunks");
		assertThat(found).hasSize(8);
		assertThat(found).allSatisfy(chunk -> {
			assertThat(chunk.path("headingPath").isNull()).isTrue();
			assertThat(chunk.path("similarity").asDouble()).isZero();
			assertThat(chunk.path("text").asString()).contains("tomatoes");
		});
		assertThat(found.toString()).doesNotContain("Their");
	}

}
