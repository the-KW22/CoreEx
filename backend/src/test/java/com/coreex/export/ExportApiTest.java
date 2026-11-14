package com.coreex.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestStorage;
import com.coreex.TestSupportConfiguration.TestClock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Export: everything a User keeps, as one zip. */
class ExportApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestStorage storage;

	@Autowired
	TestClock clock;

	private String userA;

	private String userB;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		storage.clear();
		userA = userToken("a@example.com", "USER");
		userB = userToken("b@example.com", "USER");
	}

	private String userToken(String email, String role) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, :role)").param("id", id)
				.param("email", email).param("role", role).update();
		return TestJwts.tokenFor(id, email);
	}

	private HttpResponse<byte[]> export(String token) throws Exception {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/export")).GET();
		if (token != null) {
			request.header("Authorization", "Bearer " + token);
		}
		return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
	}

	private static Map<String, byte[]> unzip(byte[] zip) throws Exception {
		var entries = new LinkedHashMap<String, byte[]>();
		try (var in = new ZipInputStream(new ByteArrayInputStream(zip))) {
			for (var entry = in.getNextEntry(); entry != null; entry = in.getNextEntry()) {
				entries.put(entry.getName(), in.readAllBytes());
			}
		}
		return entries;
	}

	private Map<String, byte[]> exported(String token) throws Exception {
		var response = export(token);
		assertThat(response.statusCode()).as(new String(response.body(), StandardCharsets.UTF_8)).isEqualTo(200);
		return unzip(response.body());
	}

	private static JsonNode manifest(Map<String, byte[]> zip) throws Exception {
		return JSON.readTree(new String(zip.get("manifest.json"), StandardCharsets.UTF_8));
	}

	private static String text(Map<String, byte[]> zip, String path) {
		assertThat(zip).containsKey(path);
		return new String(zip.get(path), StandardCharsets.UTF_8);
	}

	private String id(String json) throws Exception {
		return JSON.readTree(json).path("id").asString();
	}

	private String folder(String token, String name, String parentId) throws Exception {
		var parent = parentId == null ? "null" : "\"" + parentId + "\"";
		var created = post("/api/folders", token, "{\"name\":\"" + name + "\",\"parentId\":" + parent + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return id(created.body());
	}

	private String note(String token, String title, String body, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		var created = post("/api/notes", token, "{\"title\":" + JSON.writeValueAsString(title) + ",\"body\":"
				+ JSON.writeValueAsString(body) + ",\"folderId\":" + folder + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return id(created.body());
	}

	private void tag(String token, String itemId, String name) throws Exception {
		assertThat(post("/api/items/" + itemId + "/tags", token, "{\"name\":\"" + name + "\"}").statusCode() / 100)
				.isEqualTo(2);
	}

	private String asset(String token, String filename, byte[] bytes, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		var started = post("/api/assets/uploads", token, "{\"filename\":\"" + filename
				+ "\",\"mimeType\":\"image/png\",\"sizeBytes\":" + bytes.length + ",\"folderId\":" + folder + "}");
		assertThat(started.statusCode()).as(started.body()).isEqualTo(201);
		var uploadId = JSON.readTree(started.body()).path("uploadId").asString();
		var key = jdbc.sql("select storage_key from pending_uploads where id = :id").param("id", UUID.fromString(uploadId))
				.query(String.class).single();
		storage.putBytes(key, bytes, "image/png");
		var confirmed = post("/api/assets/uploads/" + uploadId + "/confirm", token, null);
		assertThat(confirmed.statusCode()).as(confirmed.body()).isEqualTo(201);
		return id(confirmed.body());
	}

	@Test
	void theZipHoldsNotesInTheFolderTreeAssetsTagsAndAManifestThatMatches() throws Exception {
		var research = folder(userA, "Research", null);
		var physics = folder(userA, "Physics", research);
		var inbox = note(userA, "Inbox", "loose thoughts", null);
		var energy = note(userA, "Energy", "# Energy\n\nSee [[Inbox]] and [[Missing]].", physics);
		var picture = new byte[] { 1, 2, 3, 4, 5 };
		var diagram = asset(userA, "diagram.png", picture, research);
		tag(userA, energy, "physics");
		tag(userA, energy, "Draft");
		var tagId = JSON.readTree(get("/api/items/" + energy + "/tags", userA).body()).path("items").get(0).path("id")
				.asString();
		assertThat(put("/api/tags/" + tagId + "/colour", userA, "{\"colour\":\"teal\"}").statusCode()).isEqualTo(200);
		var stored = JSON.readTree(get("/api/notes/" + energy, userA).body());

		var response = export(userA);
		var zip = unzip(response.body());

		assertThat(response.headers().firstValue("content-type")).hasValueSatisfying(t -> assertThat(t).startsWith("application/zip"));
		// The date is the test clock's: other test classes move the shared clock.
		var today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC).toString();
		assertThat(response.headers().firstValue("content-disposition")).contains("attachment; filename=\"coreex-export-" + today + ".zip\"");
		assertThat(zip.keySet()).containsExactlyInAnyOrder("Inbox.md", "Research/Physics/Energy.md", "Research/diagram.png",
				"manifest.json");
		// A Note is written exactly as stored, its Links as written.
		assertThat(text(zip, "Research/Physics/Energy.md")).isEqualTo(stored.path("body").asString()).contains("[[" + inbox + "|Inbox]]");
		assertThat(text(zip, "Inbox.md")).isEqualTo("loose thoughts");
		assertThat(zip.get("Research/diagram.png")).isEqualTo(picture);

		var manifest = manifest(zip);
		assertThat(manifest.path("exportedAt").asString()).startsWith(today + "T");
		assertThat(manifest.path("omitted")).isEmpty();
		var items = new LinkedHashMap<String, JsonNode>();
		manifest.path("items").forEach(item -> items.put(item.path("id").asString(), item));
		assertThat(items).hasSize(3);
		var energyEntry = items.get(energy);
		assertThat(energyEntry.path("type").asString()).isEqualTo("NOTE");
		assertThat(energyEntry.path("title").asString()).isEqualTo("Energy");
		assertThat(energyEntry.path("folder").asString()).isEqualTo("Research / Physics");
		assertThat(energyEntry.path("path").asString()).isEqualTo("Research/Physics/Energy.md");
		assertThat(energyEntry.path("createdAt").asString()).isNotBlank();
		assertThat(energyEntry.path("updatedAt").asString()).isNotBlank();
		assertThat(energyEntry.path("tags").get(0).path("name").asString()).isEqualTo("Draft");
		assertThat(energyEntry.path("tags").get(0).path("colour").asString()).isEqualTo("teal");
		assertThat(energyEntry.path("tags").get(1).path("name").asString()).isEqualTo("physics");
		assertThat(energyEntry.path("tags").get(1).path("colour").isNull()).isTrue();
		assertThat(items.get(inbox).path("folder").isNull()).isTrue();
		assertThat(items.get(diagram).path("type").asString()).isEqualTo("ASSET");
		assertThat(items.get(diagram).path("mimeType").asString()).isEqualTo("image/png");
		assertThat(items.get(diagram).path("sizeBytes").asInt()).isEqualTo(picture.length);
	}

	@Test
	void theTrashAndOtherUsersItemsAreNotInIt() throws Exception {
		var kept = note(userA, "Kept", "a", null);
		var trashed = note(userA, "Trashed", "b", null);
		var doomed = folder(userA, "Doomed", null);
		note(userA, "In doomed folder", "c", doomed);
		var trashedAsset = asset(userA, "gone.png", new byte[] { 9 }, null);
		note(userB, "Bs note", "secret of B", null);
		asset(userB, "bs.png", new byte[] { 7 }, null);
		assertThat(delete("/api/notes/" + trashed, userA).statusCode()).isEqualTo(204);
		assertThat(delete("/api/folders/" + doomed, userA).statusCode()).isEqualTo(204);
		assertThat(delete("/api/assets/" + trashedAsset, userA).statusCode()).isEqualTo(204);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Kept.md", "manifest.json");
		assertThat(manifest(zip).path("items")).hasSize(1);
		assertThat(manifest(zip).path("items").get(0).path("id").asString()).isEqualTo(kept);
		assertThat(new String(zip.get("manifest.json"), StandardCharsets.UTF_8)).doesNotContain("secret of B").doesNotContain("Bs note");
	}

	@Test
	void anAdminExportsOnlyTheirOwnItems() throws Exception {
		note(userA, "A private", "only for A", null);
		var admin = userToken("owner@example.com", "ADMIN");
		note(admin, "Admin's own", "mine", null);

		var zip = exported(admin);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Admin's own.md", "manifest.json");
	}

	@Test
	void anEmptyAccountGivesAValidZipWithAnEmptyManifest() throws Exception {
		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactly("manifest.json");
		assertThat(manifest(zip).path("items")).isEmpty();
		assertThat(manifest(zip).path("omitted")).isEmpty();
	}

	@Test
	void twoItemsWithTheSameTitleInOneFolderKeepBothUnderDifferentNames() throws Exception {
		note(userA, "Plans", "first", null);
		note(userA, "plans", "second", null);
		note(userA, "a/b:c", "odd name", null);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Plans.md", "plans (2).md", "a-b-c.md", "manifest.json");
		assertThat(text(zip, "Plans.md")).isEqualTo("first");
		assertThat(text(zip, "plans (2).md")).isEqualTo("second");
	}

	@Test
	void anAssetWhoseFileIsMissingIsListedAsOmittedAndTheRestIsIntact() throws Exception {
		note(userA, "Fine", "text", null);
		var lost = asset(userA, "lost.png", new byte[] { 1, 2 }, null);
		asset(userA, "good.png", new byte[] { 3, 4 }, null);
		var key = jdbc.sql("select storage_key from asset_files where item_id = :id").param("id", UUID.fromString(lost))
				.query(String.class).single();
		storage.delete(key);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Fine.md", "good.png", "manifest.json");
		assertThat(zip.get("good.png")).isEqualTo(new byte[] { 3, 4 });
		var omitted = manifest(zip).path("omitted");
		assertThat(omitted).hasSize(1);
		assertThat(omitted.get(0).path("id").asString()).isEqualTo(lost);
		assertThat(omitted.get(0).path("title").asString()).isEqualTo("lost.png");
		assertThat(omitted.get(0).path("reason").asString()).contains("missing from Storage");
	}

	@Test
	void assetsWhoseFilesCannotBeReadBecauseStorageIsDownAreListedAndNotesStillExport() throws Exception {
		note(userA, "Fine", "text", null);
		asset(userA, "pic.png", new byte[] { 1 }, null);
		storage.setDown(true);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Fine.md", "manifest.json");
		assertThat(manifest(zip).path("omitted").get(0).path("reason").asString()).contains("could not be read");
	}

	@Test
	void noTokenIsRefused() throws Exception {
		assertThat(export(null).statusCode()).isEqualTo(401);
	}

	@Test
	void aSecondExportInsideTheMinuteIsRefusedAndAllowedAfterIt() throws Exception {
		assertThat(export(userA).statusCode()).isEqualTo(200);

		var again = export(userA);

		assertThat(again.statusCode()).isEqualTo(429);
		assertThat(new String(again.body(), StandardCharsets.UTF_8)).contains("EXPORT_TOO_SOON");
		assertThat(export(userB).statusCode()).as("the limit is per User").isEqualTo(200);
		clock.advance(Duration.ofMinutes(2));
		assertThat(export(userA).statusCode()).isEqualTo(200);
	}

}
