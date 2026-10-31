package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Base for the MCP tool tests: an Agent speaks JSON-RPC over HTTP to /mcp with a real Access token. */
abstract class McpApiTest extends ApiTest {

	protected static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	protected JdbcClient jdbc;

	protected String jwt;

	protected String token;

	@BeforeEach
	void signUp() throws Exception {
		jdbc.sql("delete from users").update();
		jwt = newUser("a@example.com");
		token = newToken(jwt);
	}

	protected String newUser(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id).param("email", email)
				.update();
		return TestJwts.tokenFor(id, email);
	}

	protected String newToken(String userJwt) throws Exception {
		return JSON.readTree(post("/api/access-tokens", userJwt, "{\"name\":\"agent\"}").body()).path("token").asString();
	}

	protected JsonNode rpc(String bearer, String method, String params) throws Exception {
		var body = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"" + method + "\",\"params\":" + params + "}";
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/mcp"))
				.header("Content-Type", "application/json").header("Accept", "application/json, text/event-stream")
				.header("Authorization", "Bearer " + bearer).POST(HttpRequest.BodyPublishers.ofString(body)).build();
		HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return JSON.readTree(response.body());
	}

	/** The tool's result as JSON; fails the test if the tool reported an error. */
	protected JsonNode call(String bearer, String tool, String arguments) throws Exception {
		var result = rpc(bearer, "tools/call", "{\"name\":\"" + tool + "\",\"arguments\":" + arguments + "}").path("result");
		assertThat(result.path("isError").asBoolean()).as(result.toString()).isFalse();
		return JSON.readTree(result.path("content").get(0).path("text").asString());
	}

	protected JsonNode call(String tool, String arguments) throws Exception {
		return call(token, tool, arguments);
	}

	/** The error text of a tool call that failed. */
	protected String callFails(String tool, String arguments) throws Exception {
		var result = rpc(token, "tools/call", "{\"name\":\"" + tool + "\",\"arguments\":" + arguments + "}").path("result");
		assertThat(result.path("isError").asBoolean()).as(result.toString()).isTrue();
		return result.path("content").get(0).path("text").asString();
	}

	protected String id(String json) throws Exception {
		return JSON.readTree(json).path("id").asString();
	}

	protected String note(String userJwt, String title, String body, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		return id(post("/api/notes", userJwt,
				"{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"folderId\":" + folder + "}").body());
	}

	protected String folder(String name) throws Exception {
		return id(post("/api/folders", jwt, "{\"name\":\"" + name + "\"}").body());
	}

	protected void tag(String itemId, String name) throws Exception {
		post("/api/items/" + itemId + "/tags", jwt, "{\"name\":\"" + name + "\"}");
	}

	protected String asset(String title) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into items (id, owner_id, type, title) select :id, id, 'ASSET', :title from users where email = 'a@example.com'")
				.param("id", id).param("title", title).update();
		jdbc.sql("insert into asset_files (item_id, storage_key, mime_type, size_bytes, description) values (:id, :key, 'image/png', 2048, 'A diagram')")
				.param("id", id).param("key", "secret/" + id).update();
		return id.toString();
	}

}
