package com.coreex.assets;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestStorage;
import com.coreex.TestSupportConfiguration.TestClock;

class AssetApiTest extends ApiTest {

	private static final long MB = 1024 * 1024;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestStorage storage;

	@Autowired
	TestClock clock;

	@Autowired
	PendingUploadCleanup cleanup;

	private String userA;

	private String userB;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		storage.clear();
		userA = userToken("a@example.com");
		userB = userToken("b@example.com");
	}

	private String userToken(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	private String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private HttpResponse<String> intent(String token, String filename, String mime, long size, String folderId)
			throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		return post("/api/assets/uploads", token, "{\"filename\":\"" + filename + "\",\"mimeType\":\"" + mime
				+ "\",\"sizeBytes\":" + size + ",\"folderId\":" + folder + "}");
	}

	private String pendingKey(String uploadId) {
		return jdbc.sql("select storage_key from pending_uploads where id = :id").param("id", UUID.fromString(uploadId))
				.query(String.class).single();
	}

	private String assetKey(String assetId) {
		return jdbc.sql("select storage_key from asset_files where item_id = :id")
				.param("id", UUID.fromString(assetId)).query(String.class).single();
	}

	private long pendingCount() {
		return jdbc.sql("select count(*) from pending_uploads").query(Long.class).single();
	}

	private HttpResponse<String> confirm(String token, String uploadId) throws Exception {
		return post("/api/assets/uploads/" + uploadId + "/confirm", token, null);
	}

	/** Intent, the browser's PUT (simulated), and confirm. Returns the confirm response. */
	private HttpResponse<String> upload(String token, String filename, String mime, long size, String folderId)
			throws Exception {
		var started = intent(token, filename, mime, size, folderId);
		assertThat(started.statusCode()).as(started.body()).isEqualTo(201);
		var uploadId = field(started.body(), "uploadId");
		storage.put(pendingKey(uploadId), size, mime);
		return confirm(token, uploadId);
	}

	private String asset(String token, String filename, String mime, long size) throws Exception {
		var confirmed = upload(token, filename, mime, size, null);
		assertThat(confirmed.statusCode()).as(confirmed.body()).isEqualTo(201);
		return field(confirmed.body(), "id");
	}

	private void setQuota(String email, long bytes) {
		jdbc.sql("update users set storage_quota_bytes = :bytes where email = :email").param("bytes", bytes)
				.param("email", email).update();
	}

	@Test
	void anAssetIsUploadedConfirmedAndListedWithTheRealSize() throws Exception {
		var started = intent(userA, "photo.png", "image/png", 2000, null);
		assertThat(started.statusCode()).isEqualTo(201);
		var uploadId = field(started.body(), "uploadId");
		assertThat(started.body()).contains("https://storage.test/upload/");
		// A pending upload is not an Item yet.
		assertThat(get("/api/items", userA).body()).contains("\"total\":0");

		// The file turns out to be a little smaller than the browser said: the stored size is the truth.
		storage.put(pendingKey(uploadId), 1999, "image/png");
		var confirmed = confirm(userA, uploadId);

		assertThat(confirmed.statusCode()).isEqualTo(201);
		assertThat(confirmed.body()).contains("\"title\":\"photo.png\"").contains("\"mimeType\":\"image/png\"")
				.contains("\"sizeBytes\":1999").contains("\"description\":\"\"").contains("\"folderId\":null");
		var id = field(confirmed.body(), "id");
		assertThat(pendingCount()).isZero();
		var items = get("/api/items", userA).body();
		assertThat(items).contains("\"total\":1").contains("\"type\":\"ASSET\"").contains("photo.png");
		assertThat(get("/api/assets/" + id, userA).body()).contains("\"sizeBytes\":1999");
		assertThat(get("/api/assets/usage", userA).body()).contains("\"usedBytes\":1999")
				.contains("\"quotaBytes\":104857600");
	}

	@Test
	void aFilePathInTheNameIsDroppedFromTheTitle() throws Exception {
		var confirmed = upload(userA, "C:\\\\Users\\\\me\\\\scan.pdf", "application/pdf", 10, null);

		assertThat(confirmed.body()).contains("\"title\":\"scan.pdf\"");
	}

	@Test
	void everyAllowedTypeIsAcceptedAndNothingElse() throws Exception {
		for (var mime : new String[] { "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
				"IMAGE/PNG" }) {
			assertThat(intent(userA, "f", mime, 10, null).statusCode()).as(mime).isEqualTo(201);
		}
		for (var mime : new String[] { "image/svg+xml", "text/html", "application/zip", "text/plain", "" }) {
			var refused = intent(userA, "f", mime, 10, null);
			assertThat(refused.statusCode()).as(mime).isEqualTo(415);
			assertThat(refused.body()).contains("\"code\":\"UNSUPPORTED_TYPE\"");
		}
	}

	@Test
	void filesOverFiveMegabytesAreRefusedAtIntent() throws Exception {
		assertThat(intent(userA, "ok.png", "image/png", 5 * MB, null).statusCode()).isEqualTo(201);

		var tooBig = intent(userA, "big.png", "image/png", 5 * MB + 1, null);

		assertThat(tooBig.statusCode()).isEqualTo(413);
		assertThat(tooBig.body()).contains("\"code\":\"FILE_TOO_LARGE\"");
	}

	@Test
	void aQuotaThatWouldBeExceededIsRefusedAtIntent() throws Exception {
		setQuota("a@example.com", 10_000);
		asset(userA, "first.png", "image/png", 6000);

		var refused = intent(userA, "second.png", "image/png", 5000, null);

		assertThat(refused.statusCode()).isEqualTo(413);
		assertThat(refused.body()).contains("\"code\":\"QUOTA_EXCEEDED\"");
		// Exactly what is left fits.
		assertThat(intent(userA, "third.png", "image/png", 4000, null).statusCode()).isEqualTo(201);
		assertThat(get("/api/assets/usage", userA).body()).contains("\"usedBytes\":6000")
				.contains("\"quotaBytes\":10000");
	}

	@Test
	void usageCountsAssetsInTheTrashToo() throws Exception {
		setQuota("a@example.com", 10_000);
		var id = asset(userA, "first.png", "image/png", 6000);

		assertThat(delete("/api/assets/" + id, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/assets/usage", userA).body()).contains("\"usedBytes\":6000");
		assertThat(intent(userA, "second.png", "image/png", 5000, null).statusCode()).isEqualTo(413);
	}

	@Test
	void theQuotaIsCheckedAgainWhenTheUploadIsConfirmed() throws Exception {
		setQuota("a@example.com", 10_000);
		// Two intents both fit when asked (nothing is used yet), but not both once confirmed.
		var first = field(intent(userA, "one.png", "image/png", 6000, null).body(), "uploadId");
		var second = field(intent(userA, "two.png", "image/png", 6000, null).body(), "uploadId");
		storage.put(pendingKey(first), 6000, "image/png");
		storage.put(pendingKey(second), 6000, "image/png");
		var secondKey = pendingKey(second);

		assertThat(confirm(userA, first).statusCode()).isEqualTo(201);
		var refused = confirm(userA, second);

		assertThat(refused.statusCode()).isEqualTo(413);
		assertThat(refused.body()).contains("\"code\":\"QUOTA_EXCEEDED\"");
		assertThat(storage.exists(secondKey)).isFalse();
		assertThat(pendingCount()).isZero();
	}

	@Test
	void confirmingBeforeTheFileIsThereCanBeRetried() throws Exception {
		var uploadId = field(intent(userA, "late.png", "image/png", 100, null).body(), "uploadId");

		var early = confirm(userA, uploadId);

		assertThat(early.statusCode()).isEqualTo(409);
		assertThat(early.body()).contains("\"code\":\"UPLOAD_MISSING\"");
		storage.put(pendingKey(uploadId), 100, "image/png");
		assertThat(confirm(userA, uploadId).statusCode()).isEqualTo(201);
	}

	@Test
	void aStoredFileOverFiveMegabytesIsRefusedAndRemovedAtConfirm() throws Exception {
		// The browser claimed 100 bytes, but what arrived is 6 MB.
		var uploadId = field(intent(userA, "liar.png", "image/png", 100, null).body(), "uploadId");
		var key = pendingKey(uploadId);
		storage.put(key, 6 * MB, "image/png");

		var refused = confirm(userA, uploadId);

		assertThat(refused.statusCode()).isEqualTo(413);
		assertThat(refused.body()).contains("\"code\":\"FILE_TOO_LARGE\"");
		assertThat(storage.exists(key)).isFalse();
		assertThat(pendingCount()).isZero();
		assertThat(get("/api/items", userA).body()).contains("\"total\":0");
	}

	@Test
	void aStoredFileOfAnotherTypeIsRefusedAndRemovedAtConfirm() throws Exception {
		var uploadId = field(intent(userA, "fake.png", "image/png", 100, null).body(), "uploadId");
		var key = pendingKey(uploadId);
		storage.put(key, 100, "text/html");

		var refused = confirm(userA, uploadId);

		assertThat(refused.statusCode()).isEqualTo(415);
		assertThat(refused.body()).contains("\"code\":\"UNSUPPORTED_TYPE\"");
		assertThat(storage.exists(key)).isFalse();
		assertThat(pendingCount()).isZero();
	}

	@Test
	void anUploadCannotBeConfirmedTwice() throws Exception {
		var uploadId = field(intent(userA, "once.png", "image/png", 100, null).body(), "uploadId");
		storage.put(pendingKey(uploadId), 100, "image/png");
		assertThat(confirm(userA, uploadId).statusCode()).isEqualTo(201);

		assertThat(confirm(userA, uploadId).statusCode()).isEqualTo(404);
		assertThat(get("/api/items", userA).body()).contains("\"total\":1");
	}

	@Test
	void viewAndDownloadUseShortLivedUrlsForTheOwnerOnly() throws Exception {
		var id = asset(userA, "My Photo", "image/png", 100);
		var key = assetKey(id);

		var view = get("/api/assets/" + id + "/url", userA);
		assertThat(view.statusCode()).isEqualTo(200);
		assertThat(view.body()).contains("https://storage.test/object/" + key).contains("ttl=300")
				.contains("\"expiresInSeconds\":300").doesNotContain("download=");

		var download = get("/api/assets/" + id + "/url?download=true", userA);
		assertThat(download.body()).contains("download=My_Photo.png");

		assertThat(get("/api/assets/" + id + "/url", userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/assets/" + id + "/url").statusCode()).isEqualTo(401);
		delete("/api/assets/" + id, userA);
		assertThat(get("/api/assets/" + id + "/url", userA).statusCode()).isEqualTo(404);
	}

	@Test
	void anAssetCanBeRenamedAndDescribed() throws Exception {
		var id = asset(userA, "IMG_0001.jpg", "image/jpeg", 100);

		var updated = put("/api/assets/" + id, userA, "{\"title\":\"  Holiday  \",\"description\":\"Day one\"}");

		assertThat(updated.statusCode()).isEqualTo(200);
		assertThat(updated.body()).contains("\"title\":\"Holiday\"").contains("\"description\":\"Day one\"");
		assertThat(get("/api/items", userA).body()).contains("Holiday").doesNotContain("IMG_0001");
		assertThat(put("/api/assets/" + id, userA, "{\"title\":\"  \",\"description\":\"\"}").statusCode())
				.isEqualTo(400);
		assertThat(put("/api/assets/" + id, userA, "{\"title\":\"x\",\"description\":\"" + "d".repeat(2001) + "\"}")
				.statusCode()).isEqualTo(400);
		assertThat(put("/api/assets/" + id, userA, "{\"title\":\"x\"}").statusCode()).isEqualTo(400);
	}

	@Test
	void assetsWorkWithFoldersTagsAndLinks() throws Exception {
		var folder = field(post("/api/folders", userA, "{\"name\":\"Scans\"}").body(), "id");
		var other = field(post("/api/folders", userA, "{\"name\":\"Archive\"}").body(), "id");
		var confirmed = upload(userA, "contract.pdf", "application/pdf", 500, folder);
		var id = field(confirmed.body(), "id");

		// Folder: created in it, listed by it, moved out of it.
		assertThat(confirmed.body()).contains("\"folderId\":\"" + folder + "\"");
		assertThat(get("/api/items?folderId=" + folder, userA).body()).contains("contract.pdf");
		assertThat(post("/api/items/" + id + "/move", userA, "{\"folderId\":\"" + other + "\"}").statusCode())
				.isEqualTo(200);
		assertThat(get("/api/items?folderId=" + folder, userA).body()).contains("\"total\":0");
		assertThat(get("/api/assets/" + id, userA).body()).contains("\"folderId\":\"" + other + "\"");

		// Tag.
		var tag = post("/api/items/" + id + "/tags", userA, "{\"name\":\"Legal\"}");
		assertThat(tag.statusCode()).isEqualTo(200);
		assertThat(get("/api/items?tagId=" + field(tag.body(), "id"), userA).body()).contains("contract.pdf");

		// Link from a Note: resolves as an ASSET with its Folder path, and shows as a Backlink.
		var note = field(post("/api/notes", userA, "{\"title\":\"Notes\",\"body\":\"see [[" + id + "|contract.pdf]]\"}")
				.body(), "id");
		var resolved = post("/api/links/resolve", userA, "{\"ids\":[\"" + id + "\"]}");
		assertThat(resolved.body()).contains("\"type\":\"ASSET\"").contains("\"folderPath\":\"Archive\"");
		assertThat(get("/api/items/" + id + "/backlinks", userA).body()).contains(note);
		// ... and a hand-typed title finds it too.
		var typed = field(post("/api/notes", userA, "{\"title\":\"More\",\"body\":\"[[contract.pdf]]\"}").body(), "id");
		assertThat(get("/api/notes/" + typed, userA).body()).contains("[[" + id + "|contract.pdf]]");
	}

	@Test
	void deletingAnAssetHidesItButKeepsItsFile() throws Exception {
		var id = asset(userA, "gone.png", "image/png", 100);
		var key = assetKey(id);

		assertThat(delete("/api/assets/" + id, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/assets/" + id, userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/items", userA).body()).contains("\"total\":0");
		assertThat(delete("/api/assets/" + id, userA).statusCode()).isEqualTo(404);
		assertThat(storage.exists(key)).isTrue();
		var trashed = jdbc.sql("select deleted_at is not null and trash_batch_id is not null from items where id = :id")
				.param("id", UUID.fromString(id)).query(Boolean.class).single();
		assertThat(trashed).isTrue();
	}

	@Test
	void userBGets404ForUserAsAssetsAndUploads() throws Exception {
		var id = asset(userA, "private.png", "image/png", 100);
		var folder = field(post("/api/folders", userA, "{\"name\":\"Mine\"}").body(), "id");
		var pendingId = field(intent(userA, "pending.png", "image/png", 100, null).body(), "uploadId");
		storage.put(pendingKey(pendingId), 100, "image/png");

		assertThat(get("/api/assets/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(put("/api/assets/" + id, userB, "{\"title\":\"x\",\"description\":\"\"}").statusCode())
				.isEqualTo(404);
		assertThat(delete("/api/assets/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/assets/" + id + "/url", userB).statusCode()).isEqualTo(404);
		assertThat(confirm(userB, pendingId).statusCode()).isEqualTo(404);
		assertThat(intent(userB, "x.png", "image/png", 10, folder).statusCode()).isEqualTo(404);
		assertThat(get("/api/items", userB).body()).contains("\"total\":0").doesNotContain("private");
		assertThat(get("/api/assets/usage", userB).body()).contains("\"usedBytes\":0");
		// A's upload is still confirmable by A.
		assertThat(confirm(userA, pendingId).statusCode()).isEqualTo(201);
	}

	@Test
	void theCleanupJobRemovesOnlyUploadsPendingForMoreThanADay() throws Exception {
		var old = field(intent(userA, "old.png", "image/png", 100, null).body(), "uploadId");
		var oldKey = pendingKey(old);
		storage.put(oldKey, 100, "image/png");
		var keptAsset = asset(userA, "kept.png", "image/png", 100);
		var keptKey = assetKey(keptAsset);

		clock.advance(Duration.ofHours(23));
		var fresh = field(intent(userA, "fresh.png", "image/png", 100, null).body(), "uploadId");
		var freshKey = pendingKey(fresh);
		storage.put(freshKey, 100, "image/png");
		assertThat(cleanup.run()).isZero();
		assertThat(pendingCount()).isEqualTo(2);

		clock.advance(Duration.ofHours(2));
		assertThat(cleanup.run()).isEqualTo(1);

		// The old one and its object are gone; the fresh one (2 hours old now) and the READY Asset stay.
		assertThat(pendingCount()).isEqualTo(1);
		assertThat(storage.exists(oldKey)).isFalse();
		assertThat(storage.exists(freshKey)).isTrue();
		assertThat(storage.exists(keptKey)).isTrue();
		assertThat(get("/api/assets/" + keptAsset, userA).statusCode()).isEqualTo(200);
		// Running again changes nothing.
		assertThat(cleanup.run()).isZero();
	}

	@Test
	void whenStorageIsDownTheUserIsToldSoAndNothingIsHalfDone() throws Exception {
		storage.setDown(true);

		var refused = intent(userA, "x.png", "image/png", 10, null);

		assertThat(refused.statusCode()).isEqualTo(503);
		assertThat(refused.body()).contains("\"code\":\"STORAGE_UNAVAILABLE\"");
		storage.setDown(false);
		var id = asset(userA, "y.png", "image/png", 10);
		storage.setDown(true);
		assertThat(get("/api/assets/" + id + "/url", userA).statusCode()).isEqualTo(503);
		// Everything that does not need Storage still works.
		assertThat(get("/api/assets/" + id, userA).statusCode()).isEqualTo(200);
		assertThat(get("/api/items", userA).statusCode()).isEqualTo(200);
	}

	@Test
	void invalidRequestsGet400() throws Exception {
		assertThat(intent(userA, "   ", "image/png", 10, null).statusCode()).isEqualTo(400);
		assertThat(intent(userA, "x".repeat(201), "image/png", 10, null).statusCode()).isEqualTo(400);
		assertThat(intent(userA, "x.png", "image/png", 0, null).statusCode()).isEqualTo(400);
		assertThat(intent(userA, "x.png", "image/png", -5, null).statusCode()).isEqualTo(400);
		assertThat(post("/api/assets/uploads", userA, "{\"filename\":\"x.png\",\"sizeBytes\":10}").statusCode())
				.isEqualTo(400);
		assertThat(get("/api/assets/not-a-uuid", userA).statusCode()).isEqualTo(400);
		assertThat(pendingCount()).isZero();
	}

	@Test
	void assetEndpointsNeedASignedInUser() throws Exception {
		assertThat(get("/api/assets/usage").statusCode()).isEqualTo(401);
		assertThat(post("/api/assets/uploads", null, "{}").statusCode()).isEqualTo(401);
	}

}
