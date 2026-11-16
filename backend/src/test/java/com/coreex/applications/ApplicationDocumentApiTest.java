package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestStorage;

/** The PDFs sent for an Application: uploaded as Assets through the usual flow, attached with a label, detached. */
class ApplicationDocumentApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestStorage storage;

	private String userA;

	private String userB;

	@BeforeEach
	void clean() {
		jdbc.sql("delete from users").update();
		userA = userToken("a@example.com");
		userB = userToken("b@example.com");
	}

	private String userToken(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	private static String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private String application(String token) throws Exception {
		var created = post("/api/applications", token, "{\"company\":\"Acme\",\"role\":\"Engineer\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String asset(String token, String filename, String mime) throws Exception {
		var bytes = "%PDF-1.4 test".getBytes(StandardCharsets.UTF_8);
		var started = post("/api/assets/uploads", token, "{\"filename\":\"" + filename + "\",\"mimeType\":\"" + mime
				+ "\",\"sizeBytes\":" + bytes.length + ",\"folderId\":null}");
		assertThat(started.statusCode()).as(started.body()).isEqualTo(201);
		var uploadId = field(started.body(), "uploadId");
		var key = jdbc.sql("select storage_key from pending_uploads where id = :id").param("id", UUID.fromString(uploadId))
				.query(String.class).single();
		storage.putBytes(key, bytes, mime);
		var confirmed = post("/api/assets/uploads/" + uploadId + "/confirm", token, null);
		assertThat(confirmed.statusCode()).as(confirmed.body()).isEqualTo(201);
		return field(confirmed.body(), "id");
	}

	private String attach(String token, String application, String asset, String label) throws Exception {
		return post("/api/applications/" + application + "/documents", token,
				"{\"assetId\":\"" + asset + "\",\"label\":\"" + label + "\"}").body();
	}

	@Test
	void aPdfIsAttachedWithALabelListedAndDetachedWhileTheAssetStays() throws Exception {
		var app = application(userA);
		var cv = asset(userA, "cv.pdf", "application/pdf");
		var letter = asset(userA, "letter.pdf", "application/pdf");

		var attached = post("/api/applications/" + app + "/documents", userA,
				"{\"assetId\":\"" + cv + "\",\"label\":\"RESUME\"}");
		assertThat(attached.statusCode()).as(attached.body()).isEqualTo(201);
		attach(userA, app, letter, "COVER_LETTER");

		var listed = get("/api/applications/" + app + "/documents", userA);
		assertThat(listed.statusCode()).isEqualTo(200);
		assertThat(listed.body()).contains("\"assetId\":\"" + cv + "\"").contains("\"title\":\"cv.pdf\"")
				.contains("\"label\":\"RESUME\"").contains("\"label\":\"COVER_LETTER\"").contains("\"sizeBytes\":");

		// Attaching it again changes its label rather than listing it twice.
		attach(userA, app, cv, "OTHER");
		var again = get("/api/applications/" + app + "/documents", userA).body();
		assertThat(again.split("\"assetId\":\"" + cv + "\"", -1)).hasSize(2);
		assertThat(again).contains("\"label\":\"OTHER\"");

		assertThat(delete("/api/applications/" + app + "/documents/" + cv, userA).statusCode()).isEqualTo(204);
		assertThat(get("/api/applications/" + app + "/documents", userA).body()).doesNotContain(cv);
		assertThat(get("/api/assets/" + cv, userA).statusCode()).isEqualTo(200);
		assertThat(delete("/api/applications/" + app + "/documents/" + cv, userA).statusCode()).isEqualTo(404);
	}

	@Test
	void onlyAPdfThatIsYoursAndLiveCanBeAttachedAndTheLabelMustBeOneOfThree() throws Exception {
		var app = application(userA);
		var picture = asset(userA, "me.png", "image/png");
		var theirs = asset(userB, "theirs.pdf", "application/pdf");
		var mine = asset(userA, "mine.pdf", "application/pdf");

		assertThat(post("/api/applications/" + app + "/documents", userA,
				"{\"assetId\":\"" + picture + "\",\"label\":\"RESUME\"}").statusCode()).isEqualTo(400);
		assertThat(post("/api/applications/" + app + "/documents", userA,
				"{\"assetId\":\"" + theirs + "\",\"label\":\"RESUME\"}").statusCode()).isEqualTo(404);
		assertThat(post("/api/applications/" + app + "/documents", userA,
				"{\"assetId\":\"" + UUID.randomUUID() + "\",\"label\":\"RESUME\"}").statusCode()).isEqualTo(404);
		assertThat(post("/api/applications/" + app + "/documents", userA,
				"{\"assetId\":\"" + mine + "\",\"label\":\"PHOTO\"}").statusCode()).isEqualTo(400);
		delete("/api/assets/" + mine, userA);
		assertThat(post("/api/applications/" + app + "/documents", userA,
				"{\"assetId\":\"" + mine + "\",\"label\":\"RESUME\"}").statusCode()).isEqualTo(404);
		assertThat(get("/api/applications/" + app + "/documents", userA).body()).contains("\"items\":[]");
	}

	@Test
	void anotherUsersApplicationHasNoDocumentsForYou() throws Exception {
		var app = application(userA);
		var cv = asset(userA, "cv.pdf", "application/pdf");
		attach(userA, app, cv, "RESUME");
		var mineB = asset(userB, "b.pdf", "application/pdf");

		assertThat(get("/api/applications/" + app + "/documents", userB).statusCode()).isEqualTo(404);
		assertThat(post("/api/applications/" + app + "/documents", userB,
				"{\"assetId\":\"" + mineB + "\",\"label\":\"RESUME\"}").statusCode()).isEqualTo(404);
		assertThat(delete("/api/applications/" + app + "/documents/" + cv, userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/applications/" + app + "/documents", userA).body()).contains(cv);
	}

	@Test
	void trashingTheApplicationLeavesTheAssetAndRestoringKeepsTheDocuments() throws Exception {
		var app = application(userA);
		var cv = asset(userA, "cv.pdf", "application/pdf");
		attach(userA, app, cv, "RESUME");

		assertThat(delete("/api/applications/" + app, userA).statusCode()).isEqualTo(204);
		assertThat(get("/api/assets/" + cv, userA).statusCode()).isEqualTo(200);
		assertThat(get("/api/items?type=ASSET", userA).body()).contains(cv);

		post("/api/trash/items/" + app + "/restore", userA, null);
		assertThat(get("/api/applications/" + app + "/documents", userA).body()).contains(cv);

		// Gone for good, the Application takes only its attachments with it.
		delete("/api/applications/" + app, userA);
		assertThat(delete("/api/trash/items/" + app, userA).statusCode()).isIn(200, 204);
		assertThat(get("/api/assets/" + cv, userA).statusCode()).isEqualTo(200);
		assertThat(jdbc.sql("select count(*) from application_documents").query(Long.class).single()).isZero();
	}

	@Test
	void aTrashedAssetDropsOutOfTheListAndComesBackWithIt() throws Exception {
		var app = application(userA);
		var cv = asset(userA, "cv.pdf", "application/pdf");
		attach(userA, app, cv, "RESUME");

		delete("/api/assets/" + cv, userA);
		assertThat(get("/api/applications/" + app + "/documents", userA).body()).doesNotContain(cv);

		post("/api/trash/items/" + cv + "/restore", userA, null);
		assertThat(get("/api/applications/" + app + "/documents", userA).body()).contains(cv);
	}

}
