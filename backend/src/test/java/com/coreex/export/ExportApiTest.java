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
import java.util.Base64;
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
import com.coreex.TestResumePdfRenderer;
import com.coreex.TestStorage;
import com.coreex.TestSupportConfiguration.TestClock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

/** Export: everything a User keeps, as one zip. */
class ExportApiTest extends ApiTest {

	@Test
	void coverLetterExportsItsDocumentMarkdownAndPdfOnlyForItsOwner() throws Exception {
		var made = post("/api/cover-letters", userA, "{\"title\":\"Letter\"}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		var letter = id(made.body());
		assertThat(put("/api/cover-letters/" + letter, userA,
				"{\"title\":\"Letter\",\"version\":1,\"document\":{\"recipient\":\"Hiring team\",\"body\":\"<p>Hello <strong>there</strong></p>\"}}")
				.statusCode()).isEqualTo(200);
		var files = exported(userA);
		assertThat(text(files, "Letter.md")).contains("Hiring team", "**there**");
		assertThat(text(files, "Letter.json")).contains("Hiring team", "<strong>there</strong>");
		assertThat(files.get("Letter.pdf")).isEqualTo(TestResumePdfRenderer.PDF);
		assertThat(renderer.requests()).hasSize(1);
		assertThat(renderer.requests().get(0).letter()).isTrue();
		assertThat(exported(userB)).doesNotContainKeys("Letter.md", "Letter.json", "Letter.pdf");
	}

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestStorage storage;

	@Autowired
	TestResumePdfRenderer renderer;

	@Autowired
	TestClock clock;

	private String userA;

	private String userB;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		storage.clear();
		renderer.clear();
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
				"career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
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

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Kept.md", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
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

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Admin's own.md", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
	}

	@Test
	void moreNotesThanOneBatchAllExportOnceWithTheirOwnTextAndTags() throws Exception {
		var last = "";
		for (int i = 1; i <= 27; i++) {
			last = note(userA, "Note " + i, "text of " + i, null);
		}
		tag(userA, last, "last-one");

		var zip = exported(userA);

		assertThat(zip).hasSize(31);
		for (int i = 1; i <= 27; i++) {
			assertThat(text(zip, "Note " + i + ".md")).isEqualTo("text of " + i);
		}
		var tagged = new java.util.ArrayList<String>();
		manifest(zip).path("items").forEach(item -> {
			assertThat(item.path("path").asString()).isEqualTo(item.path("title").asString() + ".md");
			item.path("tags").forEach(t -> tagged.add(item.path("title").asString() + ":" + t.path("name").asString()));
		});
		assertThat(manifest(zip).path("items")).hasSize(27);
		assertThat(tagged).containsExactly("Note 27:last-one");
	}

	@Test
	void anEmptyAccountGivesAValidZipWithAnEmptyManifest() throws Exception {
		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
		assertThat(manifest(zip).path("items")).isEmpty();
		assertThat(manifest(zip).path("omitted")).isEmpty();
	}

	@Test
	void twoItemsWithTheSameTitleInOneFolderKeepBothUnderDifferentNames() throws Exception {
		note(userA, "Plans", "first", null);
		note(userA, "plans", "second", null);
		note(userA, "a/b:c", "odd name", null);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Plans.md", "plans (2).md", "a-b-c.md", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
		assertThat(text(zip, "Plans.md")).isEqualTo("first");
		assertThat(text(zip, "plans (2).md")).isEqualTo("second");
	}

	@Test
	void anApplicationIsExportedOnceAsJsonInItsFolderWithItsTimelineAndTags() throws Exception {
		note(userA, "Fine", "text", null);
		var jobs = folder(userA, "Jobs", null);
		var made = post("/api/applications", userA,
				"{\"company\":\"Acme\",\"role\":\"Engineer\",\"postingText\":\"We need a zebra wrangler\"}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		var id = id(made.body());
		post("/api/items/" + id + "/move", userA, "{\"folderId\":\"" + jobs + "\"}");
		tag(userA, id, "remote");
		post("/api/applications/" + id + "/timeline", userA,
				"{\"type\":\"NOTE\",\"text\":\"Spoke to the recruiter\",\"version\":1}");
		// Another User's and a trashed Application are not in this Export.
		post("/api/applications", userB, "{\"company\":\"Theirs\",\"role\":\"Spy\"}");
		var trashed = id(post("/api/applications", userA, "{\"company\":\"Gone\",\"role\":\"Ghost\"}").body());
		delete("/api/applications/" + trashed, userA);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Fine.md", "Jobs/Engineer at Acme.json", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
		var application = JSON.readTree(text(zip, "Jobs/Engineer at Acme.json"));
		assertThat(application.path("id").asString()).isEqualTo(id);
		assertThat(application.path("title").asString()).isEqualTo("Engineer at Acme");
		assertThat(application.path("company").asString()).isEqualTo("Acme");
		assertThat(application.path("role").asString()).isEqualTo("Engineer");
		assertThat(application.path("postingText").asString()).isEqualTo("We need a zebra wrangler");
		assertThat(application.path("stage").asString()).isEqualTo("SAVED");
		assertThat(application.path("timeline")).hasSize(2);
		assertThat(application.path("timeline").get(1).path("text").asString()).isEqualTo("Spoke to the recruiter");
		assertThat(application.path("tags").get(0).asString()).isEqualTo("remote");
		var entries = new java.util.ArrayList<String>();
		manifest(zip).path("items").forEach(i -> entries.add(i.path("type").asString() + ":" + i.path("path").asString()));
		assertThat(entries).containsExactlyInAnyOrder("NOTE:Fine.md", "APPLICATION:Jobs/Engineer at Acme.json");
		assertThat(manifest(zip).path("omitted")).isEmpty();
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

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Fine.md", "good.png", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
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

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Fine.md", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
		assertThat(manifest(zip).path("omitted").get(0).path("reason").asString()).contains("could not be read");
	}

	private String resume(String token, String title, String folderId) throws Exception {
		var created = post("/api/resumes", token, "{\"sample\":true,\"title\":" + JSON.writeValueAsString(title) + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		var resume = id(created.body());
		if (folderId != null) {
			assertThat(post("/api/items/" + resume + "/move", token, "{\"folderId\":\"" + folderId + "\"}").statusCode() / 100)
					.isEqualTo(2);
		}
		return resume;
	}

	@Test
	void aResumeIsWrittenAsJsonMarkdownAndPdfInItsFolderAndListedInTheManifest() throws Exception {
		var jobs = folder(userA, "Jobs", null);
		var cv = resume(userA, "CV", jobs);
		var stored = JSON.readTree(get("/api/resumes/" + cv, userA).body());
		var markdown = JSON.readTree(get("/api/resumes/" + cv + "/markdown", userA).body()).path("markdown").asString();

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("Jobs/CV.json", "Jobs/CV.md", "Jobs/CV.pdf", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
		// The JSON is the Resume's document, and the Markdown is the same text the Resume's own endpoint gives.
		assertThat(JSON.readTree(text(zip, "Jobs/CV.json"))).isEqualTo(stored.path("document"));
		assertThat(text(zip, "Jobs/CV.md")).isEqualTo(markdown).isNotBlank();
		assertThat(zip.get("Jobs/CV.pdf")).isEqualTo(TestResumePdfRenderer.PDF);
		assertThat(renderer.requests()).hasSize(1);
		assertThat(renderer.requests().get(0).photoSrc()).isNull();

		var cvEntry = new LinkedHashMap<String, JsonNode>();
		manifest(zip).path("items").forEach(item -> cvEntry.put(item.path("id").asString(), item));
		var entry = cvEntry.get(cv);
		assertThat(entry.path("type").asString()).isEqualTo("RESUME");
		assertThat(entry.path("title").asString()).isEqualTo("CV");
		assertThat(entry.path("folder").asString()).isEqualTo("Jobs");
		assertThat(entry.path("path").asString()).isEqualTo("Jobs/CV.json");
		var paths = new java.util.ArrayList<String>();
		entry.path("paths").forEach(p -> paths.add(p.asString()));
		assertThat(paths).containsExactly("Jobs/CV.json", "Jobs/CV.md", "Jobs/CV.pdf");
		assertThat(manifest(zip).path("omitted")).isEmpty();
	}

	@Test
	void aResumePdfThatCannotBeMadeIsOmittedWithAReasonAndTheRestOfTheResumeIsWritten() throws Exception {
		var cv = resume(userA, "CV", null);
		renderer.setFailing(true);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("CV.json", "CV.md", "career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
		var omitted = manifest(zip).path("omitted");
		assertThat(omitted).hasSize(1);
		assertThat(omitted.get(0).path("id").asString()).isEqualTo(cv);
		assertThat(omitted.get(0).path("title").asString()).isEqualTo("CV");
		assertThat(omitted.get(0).path("reason").asString()).contains("PDF");
		var paths = new java.util.ArrayList<String>();
		manifest(zip).path("items").get(0).path("paths").forEach(p -> paths.add(p.asString()));
		assertThat(paths).containsExactly("CV.json", "CV.md");
	}

	@Test
	void anotherUsersAndATrashedResumeAreNeverRenderedOrWritten() throws Exception {
		resume(userB, "B's CV", null);
		var trashed = resume(userA, "Old CV", null);
		assertThat(delete("/api/resumes/" + trashed, userA).statusCode()).isEqualTo(204);

		var zip = exported(userA);

		assertThat(zip.keySet()).containsExactlyInAnyOrder("career/facts.json", "career/offers.json", "career/results.json", "manifest.json");
		assertThat(renderer.requests()).isEmpty();
		assertThat(new String(zip.get("manifest.json"), StandardCharsets.UTF_8)).doesNotContain("B's CV").doesNotContain("Old CV");
	}

	@Test
	void aResumesPhotoGoesToThePdfAsTheEditorShowsIt() throws Exception {
		var cv = resume(userA, "CV", null);
		var picture = new byte[] { 1, 2, 3, 4, 5 };
		var photo = asset(userA, "me.png", picture, null);
		var saved = JSON.readTree(get("/api/resumes/" + cv, userA).body());
		var document = (ObjectNode) saved.path("document");
		((ObjectNode) document.path("basics").path("photo")).put("assetId", photo).put("visible", true);
		var put = put("/api/resumes/" + cv, userA, "{\"title\":\"CV\",\"document\":" + JSON.writeValueAsString(document)
				+ ",\"version\":" + saved.path("version").asInt() + "}");
		assertThat(put.statusCode()).as(put.body()).isEqualTo(200);

		exported(userA);

		assertThat(renderer.requests().get(0).photoSrc())
				.isEqualTo("data:image/png;base64," + Base64.getEncoder().encodeToString(picture));
	}

	private String application(String token, String company) throws Exception {
		var made = post("/api/applications", token, "{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"postingText\":\"Build things\"}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		return id(made.body());
	}

	private String offer(String token, String application, String basePay) throws Exception {
		var made = post("/api/applications/" + application + "/offers", token,
				"{\"basePay\":" + basePay + ",\"currency\":\"GBP\",\"payPeriod\":\"YEAR\"}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		return id(made.body());
	}

	private String result(String application) {
		return jdbc.sql("insert into career_results (owner_id, item_id, kind, data, input_fingerprint)"
				+ " select i.owner_id, i.id, 'FIT', cast(:data as jsonb), 'fp' from items i where i.id = :item returning id")
				.param("data", "{\"score\":80,\"question\":\"Why us?\",\"requirements\":[]}")
				.param("item", UUID.fromString(application)).query(UUID.class).single().toString();
	}

	private static JsonNode array(Map<String, byte[]> zip, String path) throws Exception {
		return JSON.readTree(text(zip, path));
	}

	private String fact(String token, String text, String quote, String noteId) throws Exception {
		var source = noteId == null ? "" : ",\"sourceKind\":\"NOTE\",\"sourceId\":\"" + noteId + "\",\"quote\":\"" + quote + "\"";
		var made = post("/api/knowledge/facts", token, "{\"text\":\"" + text + "\",\"category\":\"SKILL\"" + source + "}");
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		return id(made.body());
	}

	@Test
	void everyFactIsInTheExportOnceSwitchedOffOnesWithTheirStatusAndForgottenOnesNot() throws Exception {
		var note = note(userA, "Story", "Led a team of five engineers", null);
		var manual = fact(userA, "Knows Java", null, null);
		var pulled = fact(userA, "Led a team", "Led a team of five engineers", note);
		var off = fact(userA, "Knows COBOL", null, null);
		var forgotten = fact(userA, "Secret thing", null, null);
		assertThat(put("/api/knowledge/facts/" + off + "/status", userA, "{\"status\":\"OFF\"}").statusCode()).isEqualTo(200);
		assertThat(delete("/api/knowledge/facts/" + forgotten, userA).statusCode()).isEqualTo(204);
		fact(userB, "Rival fact", null, null);

		var zip = exported(userA);
		var facts = array(zip, "career/facts.json");

		assertThat(facts).hasSize(3);
		var byId = new java.util.HashMap<String, JsonNode>();
		facts.forEach(f -> byId.put(f.path("id").asString(), f));
		assertThat(byId.keySet()).containsExactlyInAnyOrder(manual, pulled, off);
		assertThat(byId.get(off).path("status").asString()).isEqualTo("OFF");
		assertThat(byId.get(pulled).path("quote").asString()).isEqualTo("Led a team of five engineers");
		assertThat(byId.get(pulled).has("sourceKey")).isFalse();
		assertThat(text(zip, "career/facts.json")).doesNotContain("Secret thing", "Rival fact");
	}

	@Test
	void aFolderOrNoteCalledCareerIsRenamedNotMergedIntoTheCareerDirectory() throws Exception {
		folder(userA, "career", null);
		note(userA, "career", "x", null);

		var zip = exported(userA);

		assertThat(zip.keySet()).contains("career/facts.json", "career/offers.json", "career/results.json");
		assertThat(zip.keySet()).noneMatch(n -> n.startsWith("career/") && !n.matches("career/(facts|offers|results)\\.json"));
	}

	@Test
	void anOfferAppearsOnceWithItsEarlierVersionsAndNoChecks() throws Exception {
		var app = application(userA, "Acme");
		var made = offer(userA, app, "60000");
		assertThat(put("/api/offers/" + made, userA, "{\"basePay\":65000,\"currency\":\"GBP\",\"payPeriod\":\"YEAR\",\"version\":1}")
				.statusCode()).isEqualTo(200);

		var zip = exported(userA);

		var offers = array(zip, "career/offers.json");
		assertThat(offers).hasSize(1);
		var entry = offers.get(0);
		assertThat(entry.path("id").asString()).isEqualTo(made);
		assertThat(entry.path("applicationId").asString()).isEqualTo(app);
		assertThat(entry.path("company").asString()).isEqualTo("Acme");
		assertThat(entry.path("version").asInt()).isEqualTo(2);
		assertThat(entry.path("terms").path("basePay").asInt()).isEqualTo(65000);
		assertThat(entry.has("checks")).isFalse();
		assertThat(entry.path("versions")).hasSize(1);
		assertThat(entry.path("versions").get(0).path("version").asInt()).isEqualTo(1);
		assertThat(entry.path("versions").get(0).path("terms").path("basePay").asInt()).isEqualTo(60000);
	}

	@Test
	void aCareerResultAppearsOnceAndLeavesTheExportWhenItsApplicationIsTrashed() throws Exception {
		var app = application(userA, "Acme");
		var stored = result(app);

		var zip = exported(userA);

		var results = array(zip, "career/results.json");
		assertThat(results).hasSize(1);
		assertThat(results.get(0).path("id").asString()).isEqualTo(stored);
		assertThat(results.get(0).path("applicationId").asString()).isEqualTo(app);
		assertThat(results.get(0).path("kind").asString()).isEqualTo("FIT");
		assertThat(results.get(0).has("outOfDate")).isFalse();

		clock.advance(Duration.ofMinutes(2));
		assertThat(delete("/api/applications/" + app, userA).statusCode()).isEqualTo(204);
		var afterTrash = exported(userA);
		assertThat(array(afterTrash, "career/results.json")).isEmpty();
		assertThat(array(afterTrash, "career/offers.json")).isEmpty();
	}

	@Test
	void anotherUsersOffersAndResultsAreNeverInMyExport() throws Exception {
		var mine = application(userA, "Mine Ltd");
		offer(userA, mine, "1000");
		result(mine);
		var theirs = application(userB, "Rival Ltd");
		var theirOffer = offer(userB, theirs, "99999");
		var theirResult = result(theirs);

		var zip = exported(userA);

		assertThat(array(zip, "career/offers.json")).hasSize(1);
		assertThat(array(zip, "career/results.json")).hasSize(1);
		assertThat(text(zip, "career/offers.json")).doesNotContain("Rival Ltd", "99999", theirOffer);
		assertThat(text(zip, "career/results.json")).doesNotContain("Rival Ltd", theirResult, theirs);
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
