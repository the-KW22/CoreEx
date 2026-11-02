package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The read tools. */
class McpReadToolsApiTest extends McpApiTest {

	@Test
	void theServerListsTheReadTools() throws Exception {
		var tools = rpc(token, "tools/list", "{}").path("result").path("tools");

		var names = new java.util.ArrayList<String>();
		tools.forEach(t -> names.add(t.path("name").asString()));
		assertThat(names).contains("search", "list_items", "get_item", "list_folders", "list_tags", "list_trash",
				"get_graph");
		tools.forEach(t -> assertThat(t.path("description").asString()).isNotBlank());
		tools.forEach(t -> {
			if (t.path("name").asString().equals("get_graph")) {
				assertThat(t.path("annotations").path("readOnlyHint").asBoolean()).isTrue();
			}
		});
	}

	@Test
	void searchFindsItemsAndNarrowsByTypeFolderAndTag() throws Exception {
		var folderId = folder("Research");
		var inFolder = note(jwt, "Quantum plan", "entangle the qubits", folderId);
		note(jwt, "Quantum shopping", "entangle nothing", null);
		tag(inFolder, "physics");
		var tagId = JSON.readTree(get("/api/tags", jwt).body()).path("items").get(0).path("id").asString();

		var all = call("search", "{\"query\":\"entangle\"}");
		var inResearch = call("search", "{\"query\":\"entangle\",\"folderId\":\"" + folderId + "\"}");
		var tagged = call("search", "{\"query\":\"entangle\",\"tagId\":\"" + tagId + "\"}");
		var assets = call("search", "{\"query\":\"entangle\",\"type\":\"ASSET\"}");

		assertThat(all.path("total").asInt()).isEqualTo(2);
		assertThat(inResearch.path("hits").size()).isEqualTo(1);
		assertThat(inResearch.path("hits").get(0).path("id").asString()).isEqualTo(inFolder);
		assertThat(inResearch.path("hits").get(0).path("folderPath").asString()).isEqualTo("Research");
		assertThat(inResearch.path("hits").get(0).path("snippet").asString()).contains("**entangle**");
		assertThat(tagged.path("total").asInt()).isEqualTo(1);
		assertThat(assets.path("total").asInt()).isZero();
	}

	@Test
	void listItemsPagesFiftyAtATimeWithACursor() throws Exception {
		for (int i = 0; i < 51; i++) {
			note(jwt, "Note " + i, "x", null);
		}

		var first = call("list_items", "{}");
		var second = call("list_items", "{\"cursor\":\"" + first.path("nextCursor").asString() + "\"}");

		assertThat(first.path("items").size()).isEqualTo(50);
		assertThat(first.path("total").asInt()).isEqualTo(51);
		assertThat(second.path("items").size()).isEqualTo(1);
		assertThat(second.path("nextCursor").isNull() || second.path("nextCursor").isMissingNode()).isTrue();
	}

	@Test
	void aCursorThatIsNotANumberIsRefusedWithAClearMessage() throws Exception {
		assertThat(callFails("list_items", "{\"cursor\":\"abc\"}")).contains("cursor is not valid");
	}

	@Test
	void listItemsNarrowsByFolderAndType() throws Exception {
		var folderId = folder("Inbox");
		var inInbox = note(jwt, "In the inbox", "x", folderId);
		note(jwt, "Elsewhere", "x", null);
		asset("Diagram.png");

		var byFolder = call("list_items", "{\"folderId\":\"" + folderId + "\"}");
		var assets = call("list_items", "{\"type\":\"ASSET\"}");

		assertThat(byFolder.path("items").size()).isEqualTo(1);
		assertThat(byFolder.path("items").get(0).path("id").asString()).isEqualTo(inInbox);
		assertThat(assets.path("items").size()).isEqualTo(1);
		assertThat(assets.path("items").get(0).path("title").asString()).isEqualTo("Diagram.png");
	}

	@Test
	void getItemReturnsANotesMarkdownVersionTagsFolderAndBacklinks() throws Exception {
		var folderId = folder("Research");
		var target = note(jwt, "Target", "the body", folderId);
		tag(target, "physics");
		var source = note(jwt, "Source", "see [[Target]]", null);

		var item = call("get_item", "{\"id\":\"" + target + "\"}");

		assertThat(item.path("type").asString()).isEqualTo("NOTE");
		assertThat(item.path("markdown").asString()).isEqualTo("the body");
		assertThat(item.path("version").asInt()).isEqualTo(1);
		assertThat(item.path("folderPath").asString()).isEqualTo("Research");
		assertThat(item.path("tags").get(0).path("name").asString()).isEqualTo("physics");
		assertThat(item.path("backlinks").get(0).path("id").asString()).isEqualTo(source);
	}

	@Test
	void getItemReturnsAnAssetsFactsButNeverItsStorageKey() throws Exception {
		var asset = asset("Diagram.png");

		var item = call("get_item", "{\"id\":\"" + asset + "\"}");

		assertThat(item.path("type").asString()).isEqualTo("ASSET");
		assertThat(item.path("description").asString()).isEqualTo("A diagram");
		assertThat(item.path("mimeType").asString()).isEqualTo("image/png");
		assertThat(item.path("sizeBytes").asLong()).isEqualTo(2048);
		assertThat(item.toString()).doesNotContain("secret/").doesNotContain("storage");
	}

	@Test
	void listFoldersGivesPathsParentsAndItemCounts() throws Exception {
		var parent = folder("Research");
		var child = id(post("/api/folders", jwt, "{\"name\":\"Physics\",\"parentId\":\"" + parent + "\"}").body());
		note(jwt, "In physics", "x", child);

		var folders = call("list_folders", "{}").path("folders");

		assertThat(folders.size()).isEqualTo(2);
		for (JsonNode f : folders) {
			if (f.path("id").asString().equals(child)) {
				assertThat(f.path("parentId").asString()).isEqualTo(parent);
				assertThat(f.path("path").asString()).isEqualTo("Research / Physics");
				assertThat(f.path("itemCount").asInt()).isEqualTo(1);
			}
		}
	}

	@Test
	void listTagsGivesNamesAndCounts() throws Exception {
		tag(note(jwt, "One", "x", null), "physics");
		tag(note(jwt, "Two", "x", null), "physics");

		var tags = call("list_tags", "{}").path("tags");

		assertThat(tags.size()).isEqualTo(1);
		assertThat(tags.get(0).path("name").asString()).isEqualTo("physics");
		assertThat(tags.get(0).path("itemCount").asInt()).isEqualTo(2);
	}

	@Test
	void trashedItemsAreHiddenFromEveryToolExceptListTrash() throws Exception {
		var gone = note(jwt, "Gone note", "vanish", null);
		delete("/api/notes/" + gone, jwt);

		assertThat(call("search", "{\"query\":\"vanish\"}").path("total").asInt()).isZero();
		assertThat(call("list_items", "{}").path("items").size()).isZero();
		assertThat(callFails("get_item", "{\"id\":\"" + gone + "\"}")).containsIgnoringCase("no such");
		var trash = call("list_trash", "{}");
		assertThat(trash.path("total").asInt()).isEqualTo(1);
		assertThat(trash.path("entries").get(0).path("id").asString()).isEqualTo(gone);
		assertThat(trash.path("entries").get(0).path("daysRemaining").asInt()).isEqualTo(30);
	}

	@Test
	void anotherUsersItemsAreNeverSeen() throws Exception {
		var other = newUser("b@example.com");
		var theirs = note(other, "Their secret", "hidden words", null);
		var theirFolder = id(post("/api/folders", other, "{\"name\":\"Theirs\"}").body());

		assertThat(callFails("get_item", "{\"id\":\"" + theirs + "\"}")).containsIgnoringCase("no such");
		assertThat(call("search", "{\"query\":\"hidden\"}").path("total").asInt()).isZero();
		assertThat(call("list_items", "{}").path("items").size()).isZero();
		assertThat(call("list_folders", "{}").path("folders").size()).isZero();
		assertThat(callFails("list_items", "{\"folderId\":\"" + theirFolder + "\"}")).containsIgnoringCase("no such");
		assertThat(call("get_graph", "{}").path("nodes").size()).isZero();
		assertThat(callFails("get_graph", "{\"folderId\":\"" + theirFolder + "\"}")).containsIgnoringCase("no such");
	}

	/** The node with this id in a get_graph result. */
	private static JsonNode node(JsonNode graph, String id) {
		for (JsonNode n : graph.path("nodes")) {
			if (n.path("id").asString().equals(id)) {
				return n;
			}
		}
		throw new AssertionError("no node " + id + " in " + graph);
	}

	@Test
	void getGraphShowsItemsAndLinksSoOrphansAndHubsCanBeFound() throws Exception {
		var hub = note(jwt, "Hub", "", null);
		var a = note(jwt, "A", "[[Hub]]", null);
		note(jwt, "B", "[[Hub]]", null);
		var orphan = note(jwt, "Orphan", "", null);

		var graph = call("get_graph", "{}");

		assertThat(graph.path("nodes").size()).isEqualTo(4);
		assertThat(graph.path("total").asInt()).isEqualTo(4);
		assertThat(graph.path("truncated").asBoolean()).isFalse();
		assertThat(node(graph, hub).path("linkCount").asInt()).isEqualTo(2);
		assertThat(node(graph, orphan).path("linkCount").asInt()).isZero();
		assertThat(graph.path("edges").size()).isEqualTo(2);
		for (JsonNode edge : graph.path("edges")) {
			assertThat(edge.path("target").asString()).isEqualTo(hub);
		}
		assertThat(node(graph, a).path("type").asString()).isEqualTo("NOTE");
	}

	@Test
	void getGraphForAFolderMarksItemsOutsideItAsStubsAndLeavesOutUnrelatedOnes() throws Exception {
		var folderId = folder("Research");
		var outside = note(jwt, "Outside", "", null);
		var inside = note(jwt, "Inside", "[[Outside]]", folderId);
		var unrelated = note(jwt, "Unrelated", "", null);

		var graph = call("get_graph", "{\"folderId\":\"" + folderId + "\"}");

		assertThat(graph.path("nodes").size()).isEqualTo(2);
		assertThat(node(graph, inside).path("stub").asBoolean()).isFalse();
		assertThat(node(graph, inside).path("folderPath").asString()).isEqualTo("Research");
		assertThat(node(graph, outside).path("stub").asBoolean()).isTrue();
		assertThat(graph.toString()).doesNotContain(unrelated);
	}

	@Test
	void getGraphLeavesOutTrashedItemsAndNeverSendsLayoutPositions() throws Exception {
		var kept = note(jwt, "Kept", "", null);
		var gone = note(jwt, "Gone", "[[Kept]]", null);
		put("/api/links/graph/positions/" + kept, jwt, "{\"x\":12,\"y\":34}");
		delete("/api/notes/" + gone, jwt);

		var graph = call("get_graph", "{}");

		assertThat(graph.path("nodes").size()).isEqualTo(1);
		assertThat(graph.path("edges").size()).isZero();
		assertThat(graph.toString()).doesNotContain(gone).doesNotContain("\"x\"").doesNotContain("\"y\"");
	}

}
