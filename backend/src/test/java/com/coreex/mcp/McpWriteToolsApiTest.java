package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The write tools. Results are checked through the REST API too, so a tool and the editor see the same data. */
class McpWriteToolsApiTest extends McpApiTest {

	private JsonNode restNote(String id) throws Exception {
		return JSON.readTree(get("/api/notes/" + id, jwt).body());
	}

	private static String q(String text) {
		return JSON.writeValueAsString(text);
	}

	@Test
	void thereIsNoToolThatDeletesForGoodEmptiesTheTrashDeletesATagOrTouchesFiles() throws Exception {
		var names = new ArrayList<String>();
		rpc(token, "tools/list", "{}").path("result").path("tools").forEach(t -> names.add(t.path("name").asString()));

		assertThat(names).hasSize(21).contains("create_note", "update_note", "edit_note", "create_folder",
				"rename_folder", "move_folder", "trash_folder", "create_tag", "rename_tag", "set_tag_colour", "set_tags",
				"move_item", "trash_item", "restore", "update_asset");
		assertThat(names).noneMatch(n -> n.matches(".*(delete|empty|upload|download|import|admin|purge).*"));
	}

	@Test
	void createNoteMakesANoteInAFolderWithTagsAndResolvesLinks() throws Exception {
		var folderId = folder("Research");
		var target = note(jwt, "Target", "t", null);

		var created = call("create_note", "{\"title\":\"Plan\",\"markdown\":" + q("# Plan\nsee [[Target]]")
				+ ",\"folderId\":\"" + folderId + "\",\"tags\":[\"physics\",\"draft\"]}");

		var rest = restNote(created.path("id").asString());
		assertThat(created.path("version").asInt()).isEqualTo(1);
		assertThat(rest.path("title").asString()).isEqualTo("Plan");
		assertThat(rest.path("folderId").asString()).isEqualTo(folderId);
		assertThat(rest.path("body").asString()).contains("[[" + target + "|Target]]");
		var tags = get("/api/items/" + created.path("id").asString() + "/tags", jwt).body();
		assertThat(tags).contains("physics").contains("draft");
	}

	@Test
	void theTitleComesFromTheFirstHeadingWhenNoneIsGiven() throws Exception {
		var created = call("create_note", "{\"markdown\":" + q("# From the heading\nbody") + "}");

		assertThat(restNote(created.path("id").asString()).path("title").asString()).isEqualTo("From the heading");
	}

	@Test
	void updateNoteReplacesTheTextAndBumpsTheVersion() throws Exception {
		var id = note(jwt, "Old", "old text", null);

		var saved = call("update_note", "{\"id\":\"" + id + "\",\"version\":1,\"markdown\":" + q("# New\nnew text") + "}");

		assertThat(saved.path("version").asInt()).isEqualTo(2);
		var rest = restNote(id);
		assertThat(rest.path("body").asString()).isEqualTo("# New\nnew text");
		assertThat(rest.path("title").asString()).isEqualTo("New");
	}

	@Test
	void updateNoteWithAStaleVersionIsRefusedAndChangesNothing() throws Exception {
		var id = note(jwt, "Old", "old text", null);
		call("update_note", "{\"id\":\"" + id + "\",\"version\":1,\"markdown\":\"second\"}");

		var error = callFails("update_note", "{\"id\":\"" + id + "\",\"version\":1,\"markdown\":\"third\"}");

		assertThat(error).contains("changed somewhere else");
		assertThat(restNote(id).path("body").asString()).isEqualTo("second");
	}

	@Test
	void editNoteChangesOnlyTheMatchedTextInOrder() throws Exception {
		var id = note(jwt, "Doc", "alpha beta gamma", null);

		var saved = call("edit_note", "{\"id\":\"" + id + "\",\"version\":1,\"edits\":[{\"oldText\":\"beta\",\"newText\":\"BETA\"},"
				+ "{\"oldText\":\"BETA gamma\",\"newText\":\"delta\"}]}");

		assertThat(saved.path("version").asInt()).isEqualTo(2);
		assertThat(restNote(id).path("body").asString()).isEqualTo("alpha delta");
	}

	@Test
	void editNoteKeepsTheTitleUnlessItChangesTheFirstLine() throws Exception {
		var id = note(jwt, "Meeting", "# Weekly sync\\nteh typo", null);

		call("edit_note", "{\"id\":\"" + id + "\",\"version\":1,\"edits\":[{\"oldText\":\"teh\",\"newText\":\"the\"}]}");
		assertThat(restNote(id).path("title").asString()).isEqualTo("Meeting");

		call("edit_note", "{\"id\":\"" + id + "\",\"version\":2,\"edits\":[{\"oldText\":\"Weekly sync\",\"newText\":\"Daily sync\"}]}");
		assertThat(restNote(id).path("title").asString()).isEqualTo("Daily sync");
	}

	@Test
	void editNoteThatMatchesNothingOrTwiceSavesNothing() throws Exception {
		var id = note(jwt, "Doc", "one two two", null);

		var none = callFails("edit_note", "{\"id\":\"" + id + "\",\"version\":1,\"edits\":[{\"oldText\":\"one\",\"newText\":\"1\"},"
				+ "{\"oldText\":\"three\",\"newText\":\"3\"}]}");
		var twice = callFails("edit_note", "{\"id\":\"" + id + "\",\"version\":1,\"edits\":[{\"oldText\":\"two\",\"newText\":\"2\"}]}");

		assertThat(none).contains("not found");
		assertThat(twice).contains("more than once");
		var rest = restNote(id);
		assertThat(rest.path("body").asString()).isEqualTo("one two two");
		assertThat(rest.path("version").asInt()).isEqualTo(1);
	}

	@Test
	void editNoteWithAStaleVersionIsRefused() throws Exception {
		var id = note(jwt, "Doc", "text", null);
		call("update_note", "{\"id\":\"" + id + "\",\"version\":1,\"markdown\":\"text two\"}");

		var error = callFails("edit_note", "{\"id\":\"" + id + "\",\"version\":1,\"edits\":[{\"oldText\":\"text\",\"newText\":\"x\"}]}");

		assertThat(error).contains("changed somewhere else");
	}

	@Test
	void notesLongerThanTheEditorAllowsAreRefused() throws Exception {
		var longTitle = "t".repeat(201);
		var longBody = "b".repeat(1_000_001);

		assertThat(callFails("create_note", "{\"title\":" + q(longTitle) + ",\"markdown\":\"x\"}")).contains("title");
		assertThat(callFails("create_note", "{\"title\":\"ok\",\"markdown\":" + q(longBody) + "}")).contains("markdown");
	}

	@Test
	void namesAreCheckedLikeTheRestApi() throws Exception {
		assertThat(callFails("create_folder", "{\"name\":\"   \"}")).contains("must not be empty");
		assertThat(callFails("create_tag", "{\"name\":" + q("t".repeat(51)) + "}")).contains("too long");
		assertThat(callFails("create_note", "{\"title\":\"a\\u0000b\",\"markdown\":\"x\"}")).contains("NUL");
	}

	@Test
	void anAgentEditMakesAnOpenEditorHitTheVersionConflict() throws Exception {
		var id = note(jwt, "Doc", "mine", null);
		call("update_note", "{\"id\":\"" + id + "\",\"version\":1,\"markdown\":\"theirs\"}");

		var editorSave = put("/api/notes/" + id, jwt, "{\"title\":\"Doc\",\"body\":\"mine, edited\",\"version\":1}");

		assertThat(editorSave.statusCode()).isEqualTo(409);
		assertThat(editorSave.body()).contains("VERSION_CONFLICT");
		assertThat(restNote(id).path("body").asString()).isEqualTo("theirs");
	}

	@Test
	void foldersAreCreatedRenamedMovedAndTrashed() throws Exception {
		var parent = call("create_folder", "{\"name\":\"Research\"}").path("id").asString();
		var child = call("create_folder", "{\"name\":\"Physics\",\"parentId\":\"" + parent + "\"}").path("id").asString();

		call("rename_folder", "{\"id\":\"" + child + "\",\"name\":\"Physics 2\"}");
		var other = call("create_folder", "{\"name\":\"Archive\"}").path("id").asString();
		call("move_folder", "{\"id\":\"" + child + "\",\"parentId\":\"" + other + "\"}");

		var paths = new ArrayList<String>();
		call("list_folders", "{}").path("folders").forEach(f -> paths.add(f.path("path").asString()));
		assertThat(paths).contains("Research", "Archive", "Archive / Physics 2");
		assertThat(callFails("move_folder", "{\"id\":\"" + other + "\",\"parentId\":\"" + child + "\"}")).containsIgnoringCase("itself");

		call("trash_folder", "{\"id\":\"" + other + "\"}");
		assertThat(call("list_folders", "{}").path("folders").size()).isEqualTo(1);
		assertThat(call("list_trash", "{}").path("entries").get(0).path("kind").asString()).isEqualTo("FOLDER");
	}

	@Test
	void restoringAnItemBringsBackItsTrashedFolder() throws Exception {
		var folderId = folder("Research");
		var noteId = note(jwt, "In folder", "x", folderId);
		call("trash_folder", "{\"id\":\"" + folderId + "\"}");
		assertThat(call("list_items", "{}").path("items").size()).isZero();

		call("restore", "{\"id\":\"" + noteId + "\"}");

		assertThat(call("list_items", "{}").path("items").size()).isEqualTo(1);
		assertThat(call("list_folders", "{}").path("folders").size()).isEqualTo(1);
	}

	@Test
	void restoringAFolderBringsBackWhatWentWithIt() throws Exception {
		var folderId = folder("Research");
		note(jwt, "In folder", "x", folderId);
		call("trash_folder", "{\"id\":\"" + folderId + "\"}");

		call("restore", "{\"id\":\"" + folderId + "\"}");

		assertThat(call("list_items", "{}").path("items").size()).isEqualTo(1);
		assertThat(call("list_trash", "{}").path("total").asInt()).isZero();
	}

	@Test
	void tagsAreCreatedRenamedAndRecoloured() throws Exception {
		var id = call("create_tag", "{\"name\":\"physics\",\"colour\":\"teal\"}").path("id").asString();

		call("rename_tag", "{\"id\":\"" + id + "\",\"name\":\"Physics\"}");
		call("set_tag_colour", "{\"id\":\"" + id + "\",\"colour\":\"pink\"}");

		var tags = call("list_tags", "{}").path("tags");
		assertThat(tags.size()).isEqualTo(1);
		assertThat(tags.get(0).path("name").asString()).isEqualTo("Physics");
		assertThat(tags.get(0).path("colour").asString()).isEqualTo("pink");
		assertThat(callFails("create_tag", "{\"name\":\"physics\"}")).containsIgnoringCase("already have");
	}

	@Test
	void setTagsMakesTheItemsTagsExactlyTheList() throws Exception {
		var id = note(jwt, "Doc", "x", null);
		tag(id, "old");
		tag(id, "keep");

		call("set_tags", "{\"id\":\"" + id + "\",\"tags\":[\"Keep\",\"new\"]}");

		var names = new ArrayList<String>();
		JSON.readTree(get("/api/items/" + id + "/tags", jwt).body()).path("items").forEach(t -> names.add(t.path("name").asString()));
		assertThat(names).containsExactlyInAnyOrder("keep", "new");
		assertThat(call("list_tags", "{}").path("tags").size()).isEqualTo(3);
	}

	@Test
	void itemsAreMovedAndTrashedAndRestored() throws Exception {
		var folderId = folder("Inbox");
		var noteId = note(jwt, "Doc", "x", null);
		var assetId = asset("Diagram.png");

		call("move_item", "{\"id\":\"" + noteId + "\",\"folderId\":\"" + folderId + "\"}");
		assertThat(restNote(noteId).path("folderId").asString()).isEqualTo(folderId);
		call("move_item", "{\"id\":\"" + noteId + "\"}");
		assertThat(restNote(noteId).path("folderId").isNull()).isTrue();

		call("trash_item", "{\"id\":\"" + noteId + "\"}");
		call("trash_item", "{\"id\":\"" + assetId + "\"}");
		assertThat(call("list_items", "{}").path("items").size()).isZero();
		assertThat(call("list_trash", "{}").path("total").asInt()).isEqualTo(2);

		call("restore", "{\"id\":\"" + noteId + "\"}");
		call("restore", "{\"id\":\"" + assetId + "\"}");
		assertThat(call("list_items", "{}").path("items").size()).isEqualTo(2);
	}

	@Test
	void anAssetsTitleAndDescriptionCanBeChanged() throws Exception {
		var assetId = asset("Diagram.png");

		call("update_asset", "{\"id\":\"" + assetId + "\",\"title\":\"Wiring diagram\",\"description\":\"The rack wiring\"}");

		var item = call("get_item", "{\"id\":\"" + assetId + "\"}");
		assertThat(item.path("title").asString()).isEqualTo("Wiring diagram");
		assertThat(item.path("description").asString()).isEqualTo("The rack wiring");
	}

	@Test
	void anotherUsersItemsFoldersAndTagsAreNotFoundByEveryWriteTool() throws Exception {
		var other = newUser("b@example.com");
		var theirNote = note(other, "Theirs", "x", null);
		var theirFolder = id(post("/api/folders", other, "{\"name\":\"Theirs\"}").body());
		var theirTag = id(post("/api/tags", other, "{\"name\":\"theirs\"}").body());
		var mine = note(jwt, "Mine", "x", null);
		var calls = List.of(
				new String[] { "update_note", "{\"id\":\"" + theirNote + "\",\"version\":1,\"markdown\":\"hacked\"}" },
				new String[] { "edit_note", "{\"id\":\"" + theirNote + "\",\"version\":1,\"edits\":[{\"oldText\":\"x\",\"newText\":\"y\"}]}" },
				new String[] { "rename_folder", "{\"id\":\"" + theirFolder + "\",\"name\":\"hacked\"}" },
				new String[] { "move_folder", "{\"id\":\"" + theirFolder + "\"}" },
				new String[] { "trash_folder", "{\"id\":\"" + theirFolder + "\"}" },
				new String[] { "rename_tag", "{\"id\":\"" + theirTag + "\",\"name\":\"hacked\"}" },
				new String[] { "set_tag_colour", "{\"id\":\"" + theirTag + "\",\"colour\":\"red\"}" },
				new String[] { "set_tags", "{\"id\":\"" + theirNote + "\",\"tags\":[\"x\"]}" },
				new String[] { "move_item", "{\"id\":\"" + theirNote + "\"}" },
				new String[] { "trash_item", "{\"id\":\"" + theirNote + "\"}" },
				new String[] { "restore", "{\"id\":\"" + theirNote + "\"}" },
				new String[] { "move_item", "{\"id\":\"" + mine + "\",\"folderId\":\"" + theirFolder + "\"}" },
				new String[] { "create_note", "{\"title\":\"x\",\"markdown\":\"x\",\"folderId\":\"" + theirFolder + "\"}" },
				new String[] { "create_folder", "{\"name\":\"x\",\"parentId\":\"" + theirFolder + "\"}" });

		for (var c : calls) {
			assertThat(callFails(c[0], c[1])).as(c[0]).containsIgnoringCase("no such");
		}
		assertThat(JSON.readTree(get("/api/notes/" + theirNote, other).body()).path("body").asString()).isEqualTo("x");
	}

	@Test
	void editedByNamesTheTokenUntilTheUserEditsAgain() throws Exception {
		var created = call("create_note", "{\"title\":\"Doc\",\"markdown\":\"first\"}").path("id").asString();
		assertThat(restNote(created).path("editedBy").asString()).isEqualTo("agent");

		var saved = put("/api/notes/" + created, jwt, "{\"title\":\"Doc\",\"body\":\"by me\",\"version\":1}");
		assertThat(saved.statusCode()).isEqualTo(200);
		assertThat(restNote(created).path("editedBy").isNull()).isTrue();

		call("edit_note", "{\"id\":\"" + created + "\",\"version\":2,\"edits\":[{\"oldText\":\"by me\",\"newText\":\"by agent\"}]}");
		assertThat(restNote(created).path("editedBy").asString()).isEqualTo("agent");

		var assetId = asset("Diagram.png");
		assertThat(JSON.readTree(get("/api/assets/" + assetId, jwt).body()).path("editedBy").isNull()).isTrue();
		call("update_asset", "{\"id\":\"" + assetId + "\",\"title\":\"New\",\"description\":\"d\"}");
		assertThat(JSON.readTree(get("/api/assets/" + assetId, jwt).body()).path("editedBy").asString()).isEqualTo("agent");
		put("/api/assets/" + assetId, jwt, "{\"title\":\"Mine\",\"description\":\"d\"}");
		assertThat(JSON.readTree(get("/api/assets/" + assetId, jwt).body()).path("editedBy").isNull()).isTrue();
	}

}
