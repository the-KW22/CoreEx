package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The read tools, spoken to the way an Agent does: JSON-RPC over HTTP to /mcp with a real Access token. */
class McpReadToolsApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	private String jwt;

	private String token;

	@BeforeEach
	void signUp() throws Exception {
		jdbc.sql("delete from users").update();
		jwt = newUser("a@example.com");
		token = newToken(jwt);
	}

	private String newUser(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email)
				.update();
		return TestJwts.tokenFor(id, email);
	}

	private String newToken(String userJwt) throws Exception {
		return JSON.readTree(post("/api/access-tokens", userJwt, "{\"name\":\"agent\"}").body()).path("token").asString();
	}

	private JsonNode rpc(String bearer, String method, String params) throws Exception {
		var body = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"" + method + "\",\"params\":" + params + "}";
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/mcp"))
				.header("Content-Type", "application/json").header("Accept", "application/json, text/event-stream")
				.header("Authorization", "Bearer " + bearer).POST(HttpRequest.BodyPublishers.ofString(body)).build();
		HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return JSON.readTree(response.body());
	}

	/** The tool's result as JSON; fails the test if the tool reported an error. */
	private JsonNode call(String bearer, String tool, String arguments) throws Exception {
		var result = rpc(bearer, "tools/call", "{\"name\":\"" + tool + "\",\"arguments\":" + arguments + "}").path("result");
		assertThat(result.path("isError").asBoolean()).as(result.toString()).isFalse();
		return JSON.readTree(result.path("content").get(0).path("text").asString());
	}

	private JsonNode call(String tool, String arguments) throws Exception {
		return call(token, tool, arguments);
	}

	/** The error text of a tool call that failed. */
	private String callFails(String tool, String arguments) throws Exception {
		var result = rpc(token, "tools/call", "{\"name\":\"" + tool + "\",\"arguments\":" + arguments + "}").path("result");
		assertThat(result.path("isError").asBoolean()).as(result.toString()).isTrue();
		return result.path("content").get(0).path("text").asString();
	}

	private String id(String json) throws Exception {
		return JSON.readTree(json).path("id").asString();
	}

	private String note(String userJwt, String title, String body, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		return id(post("/api/notes", userJwt,
				"{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"folderId\":" + folder + "}").body());
	}

	private String folder(String name) throws Exception {
		return id(post("/api/folders", jwt, "{\"name\":\"" + name + "\"}").body());
	}

	private void tag(String itemId, String name) throws Exception {
		post("/api/items/" + itemId + "/tags", jwt, "{\"name\":\"" + name + "\"}");
	}

	private String asset(String title) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into items (id, owner_id, type, title) select :id, id, 'ASSET', :title from users where email = 'a@example.com'")
				.param("id", id).param("title", title).update();
		jdbc.sql("insert into asset_files (item_id, storage_key, mime_type, size_bytes, description) values (:id, :key, 'image/png', 2048, 'A diagram')")
				.param("id", id).param("key", "secret/" + id).update();
		return id.toString();
	}

	@Test
	void theServerListsTheSixReadTools() throws Exception {
		var tools = rpc(token, "tools/list", "{}").path("result").path("tools");

		var names = new java.util.ArrayList<String>();
		tools.forEach(t -> names.add(t.path("name").asString()));
		assertThat(names).containsExactlyInAnyOrder("search", "list_items", "get_item", "list_folders", "list_tags",
				"list_trash");
		tools.forEach(t -> assertThat(t.path("description").asString()).isNotBlank());
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
	}

}
