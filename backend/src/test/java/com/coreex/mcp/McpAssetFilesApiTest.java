package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.coreex.TestStorage;

import tools.jackson.databind.JsonNode;

/**
 * Asset files through MCP: start_upload, the Agent's own PUT (simulated by TestStorage.put), confirm_upload, and
 * get_asset_url. The rules live in AssetService, so these tests check that the tools reach them for the right User.
 */
class McpAssetFilesApiTest extends McpApiTest {

	@Autowired
	TestStorage storage;

	@BeforeEach
	void emptyStorage() {
		storage.clear();
	}

	private static String start(String filename, String mime, long size, String folderId) {
		var folder = folderId == null ? "" : ",\"folderId\":\"" + folderId + "\"";
		return "{\"filename\":\"" + filename + "\",\"mimeType\":\"" + mime + "\",\"sizeBytes\":" + size + folder + "}";
	}

	private String pendingKey(String uploadId) {
		return jdbc.sql("select storage_key from pending_uploads where id = :id").param("id", UUID.fromString(uploadId))
				.query(String.class).single();
	}

	private long pendingCount() {
		return jdbc.sql("select count(*) from pending_uploads").query(Long.class).single();
	}

	private JsonNode restAsset(String id) throws Exception {
		return JSON.readTree(get("/api/assets/" + id, jwt).body());
	}

	/** Starts an upload and "sends" the file, as an Agent would with curl. Returns the upload id. */
	private String uploaded(String filename, String mime, long size) throws Exception {
		var uploadId = call("start_upload", start(filename, mime, size, null)).path("uploadId").asString();
		storage.put(pendingKey(uploadId), size, mime);
		return uploadId;
	}

	private boolean failsFor(String bearer, String tool, String arguments) throws Exception {
		return rpc(bearer, "tools/call", "{\"name\":\"" + tool + "\",\"arguments\":" + arguments + "}").path("result")
				.path("isError").asBoolean();
	}

	@Test
	void anAgentUploadsAFileInThreeStepsIntoAFolder() throws Exception {
		var folderId = folder("Diagrams");

		var started = call("start_upload", start("rack.png", "image/png", 2000, folderId));
		var uploadId = started.path("uploadId").asString();
		assertThat(started.path("uploadUrl").asString()).startsWith("https://storage.test/upload/");
		assertThat(started.path("howToSend").asString()).contains("PUT").contains("Content-Type");
		assertThat(pendingCount()).isEqualTo(1);
		// A pending upload is not an Item yet.
		assertThat(call("list_items", "{}").path("items").size()).isZero();

		// The file is a little smaller than announced: the stored size is the truth.
		storage.put(pendingKey(uploadId), 1999, "image/png");
		var saved = call("confirm_upload",
				"{\"uploadId\":\"" + uploadId + "\",\"title\":\"Rack wiring\",\"description\":\"The rack\"}");

		var rest = restAsset(saved.path("id").asString());
		assertThat(saved.path("title").asString()).isEqualTo("Rack wiring");
		assertThat(rest.path("title").asString()).isEqualTo("Rack wiring");
		assertThat(rest.path("description").asString()).isEqualTo("The rack");
		assertThat(rest.path("mimeType").asString()).isEqualTo("image/png");
		assertThat(rest.path("sizeBytes").asInt()).isEqualTo(1999);
		assertThat(rest.path("folderId").asString()).isEqualTo(folderId);
		assertThat(rest.path("editedBy").asString()).isEqualTo("agent");
		assertThat(pendingCount()).isZero();
	}

	@Test
	void theTitleIsTheFilenameAndTheDescriptionEmptyWhenNoneIsGiven() throws Exception {
		var saved = call("confirm_upload", "{\"uploadId\":\"" + uploaded("manual.pdf", "application/pdf", 500) + "\"}");

		var rest = restAsset(saved.path("id").asString());
		assertThat(rest.path("title").asString()).isEqualTo("manual.pdf");
		assertThat(rest.path("description").asString()).isEmpty();
		assertThat(rest.path("folderId").isNull()).isTrue();
		assertThat(rest.path("editedBy").asString()).isEqualTo("agent");
	}

	@Test
	void aFileTheWebAppWouldRefuseIsRefusedAtTheStartAndNothingIsLeftPending() throws Exception {
		jdbc.sql("update users set storage_quota_bytes = 1000").update();

		assertThat(callFails("start_upload", start("logo.svg", "image/svg+xml", 100, null))).contains("Only PNG");
		assertThat(callFails("start_upload", start("big.png", "image/png", 5 * 1024 * 1024 + 1, null)))
				.contains("at most 5 MB");
		assertThat(callFails("start_upload", start("photo.png", "image/png", 1001, null))).contains("storage quota");
		assertThat(callFails("start_upload", start("photo.png", "image/png", 100, UUID.randomUUID().toString())))
				.contains("no such Folder");
		assertThat(callFails("start_upload", start("   ", "image/png", 100, null))).contains("filename");
		assertThat(callFails("start_upload", start("empty.png", "image/png", 0, null))).contains("sizeBytes");
		assertThat(pendingCount()).isZero();
	}

	@Test
	void anotherUsersFolderIsNotFoundAtTheStart() throws Exception {
		var theirFolder = id(post("/api/folders", newUser("b@example.com"), "{\"name\":\"Theirs\"}").body());

		assertThat(callFails("start_upload", start("photo.png", "image/png", 100, theirFolder))).contains("no such Folder");
	}

	@Test
	void confirmingBeforeTheFileIsSentChangesNothingAndCanBeRepeated() throws Exception {
		var uploadId = call("start_upload", start("late.png", "image/png", 100, null)).path("uploadId").asString();

		assertThat(callFails("confirm_upload", "{\"uploadId\":\"" + uploadId + "\"}")).contains("not been uploaded yet");
		assertThat(pendingCount()).isEqualTo(1);

		storage.put(pendingKey(uploadId), 100, "image/png");
		call("confirm_upload", "{\"uploadId\":\"" + uploadId + "\"}");
		assertThat(call("list_items", "{}").path("items").size()).isEqualTo(1);
	}

	@Test
	void aTitleThatIsTooLongIsRefusedBeforeAnyAssetExists() throws Exception {
		var uploadId = uploaded("keep.png", "image/png", 100);

		assertThat(callFails("confirm_upload", "{\"uploadId\":\"" + uploadId + "\",\"title\":\"" + "t".repeat(201) + "\"}"))
				.contains("title");

		assertThat(call("list_items", "{}").path("items").size()).isZero();
		assertThat(pendingCount()).isEqualTo(1);
		call("confirm_upload", "{\"uploadId\":\"" + uploadId + "\",\"title\":\"Fine\"}");
		assertThat(call("list_items", "{}").path("items").size()).isEqualTo(1);
	}

	@Test
	void anUploadCannotBeConfirmedTwice() throws Exception {
		var uploadId = uploaded("once.png", "image/png", 100);
		call("confirm_upload", "{\"uploadId\":\"" + uploadId + "\"}");

		assertThat(callFails("confirm_upload", "{\"uploadId\":\"" + uploadId + "\"}")).contains("no such upload");
		assertThat(call("list_items", "{}").path("items").size()).isEqualTo(1);
	}

	@Test
	void aStoredFileOfAnotherTypeThanAnnouncedIsRefusedAndRemoved() throws Exception {
		var uploadId = call("start_upload", start("fake.png", "image/png", 100, null)).path("uploadId").asString();
		var key = pendingKey(uploadId);
		storage.put(key, 100, "application/pdf");

		assertThat(callFails("confirm_upload", "{\"uploadId\":\"" + uploadId + "\"}")).contains("Only PNG");

		assertThat(pendingCount()).isZero();
		assertThat(storage.exists(key)).isFalse();
		assertThat(call("list_items", "{}").path("items").size()).isZero();
	}

	@Test
	void anotherUsersUploadCannotBeConfirmed() throws Exception {
		var uploadId = uploaded("mine.png", "image/png", 100);
		var other = newToken(newUser("b@example.com"));

		assertThat(failsFor(other, "confirm_upload", "{\"uploadId\":\"" + uploadId + "\"}")).isTrue();

		assertThat(pendingCount()).isEqualTo(1);
		call("confirm_upload", "{\"uploadId\":\"" + uploadId + "\"}");
	}

	@Test
	void getAssetUrlGivesAShortLivedDownloadLinkNamedAfterTheTitle() throws Exception {
		var assetId = asset("Diagram.png");

		var link = call("get_asset_url", "{\"id\":\"" + assetId + "\"}");

		assertThat(link.path("url").asString()).startsWith("https://storage.test/object/secret/" + assetId)
				.contains("download=Diagram.png");
		assertThat(link.path("expiresInSeconds").asInt()).isEqualTo(300);
	}

	@Test
	void getAssetUrlRefusesAnotherUsersTrashedMissingAndNonAssetItems() throws Exception {
		var assetId = asset("Diagram.png");
		var noteId = note(jwt, "Doc", "x", null);
		var other = newToken(newUser("b@example.com"));
		var trashed = asset("Old.png");
		call("trash_item", "{\"id\":\"" + trashed + "\"}");

		assertThat(failsFor(other, "get_asset_url", "{\"id\":\"" + assetId + "\"}")).isTrue();
		assertThat(callFails("get_asset_url", "{\"id\":\"" + trashed + "\"}")).contains("no such Asset");
		assertThat(callFails("get_asset_url", "{\"id\":\"" + UUID.randomUUID() + "\"}")).contains("no such Asset");
		assertThat(callFails("get_asset_url", "{\"id\":\"" + noteId + "\"}")).contains("no such Asset");
	}

	@Test
	void theToolDescriptionsExplainTheStepsAndWarnAboutTheLinks() throws Exception {
		var descriptions = new java.util.HashMap<String, String>();
		rpc(token, "tools/list", "{}").path("result").path("tools")
				.forEach(t -> descriptions.put(t.path("name").asString(), t.path("description").asString()));

		assertThat(descriptions.get("start_upload")).contains("PUT").contains("confirm_upload");
		assertThat(descriptions.get("confirm_upload")).contains("start_upload");
		assertThat(descriptions.get("get_asset_url")).contains("anyone").contains("expires");
	}

}
