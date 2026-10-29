package com.coreex.trash;

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

class TrashApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestStorage storage;

	@Autowired
	TestClock clock;

	@Autowired
	TrashPurgeJob purge;

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

	private String note(String token, String title, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\",\"folderId\":" + folder + "}");
		assertThat(created.statusCode()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String folder(String token, String name, String parentId) throws Exception {
		var parent = parentId == null ? "null" : "\"" + parentId + "\"";
		var created = post("/api/folders", token, "{\"name\":\"" + name + "\",\"parentId\":" + parent + "}");
		assertThat(created.statusCode()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String asset(String token, String filename, long size) throws Exception {
		var started = post("/api/assets/uploads", token, "{\"filename\":\"" + filename
				+ "\",\"mimeType\":\"image/png\",\"sizeBytes\":" + size + "}");
		assertThat(started.statusCode()).as(started.body()).isEqualTo(201);
		var uploadId = field(started.body(), "uploadId");
		storage.put(jdbc.sql("select storage_key from pending_uploads where id = :id")
				.param("id", UUID.fromString(uploadId)).query(String.class).single(), size, "image/png");
		var confirmed = post("/api/assets/uploads/" + uploadId + "/confirm", token, null);
		assertThat(confirmed.statusCode()).as(confirmed.body()).isEqualTo(201);
		return field(confirmed.body(), "id");
	}

	private String keyOf(String assetId) {
		return jdbc.sql("select storage_key from asset_files where item_id = :id").param("id", UUID.fromString(assetId))
				.query(String.class).single();
	}

	private void trashNote(String token, String id) throws Exception {
		assertThat(delete("/api/notes/" + id, token).statusCode()).isEqualTo(204);
	}

	private void trashFolder(String token, String id) throws Exception {
		assertThat(delete("/api/folders/" + id, token).statusCode()).isEqualTo(204);
	}

	private HttpResponse<String> trash(String token) throws Exception {
		var response = get("/api/trash", token);
		assertThat(response.statusCode()).isEqualTo(200);
		return response;
	}

	private int restoreItem(String token, String id) throws Exception {
		return post("/api/trash/items/" + id + "/restore", token, null).statusCode();
	}

	private int restoreFolder(String token, String id) throws Exception {
		return post("/api/trash/folders/" + id + "/restore", token, null).statusCode();
	}

	private boolean live(String token, String noteId) throws Exception {
		return get("/api/notes/" + noteId, token).statusCode() == 200;
	}

	private boolean itemRowExists(String id) {
		return jdbc.sql("select exists (select 1 from items where id = :id)").param("id", UUID.fromString(id))
				.query(Boolean.class).single();
	}

	private boolean folderRowExists(String id) {
		return jdbc.sql("select exists (select 1 from folders where id = :id)").param("id", UUID.fromString(id))
				.query(Boolean.class).single();
	}

	@Test
	void theTrashListsOnlyTheRootsWithTheDaysRemaining() throws Exception {
		var f = folder(userA, "Projects", null);
		var s = folder(userA, "Sub", f);
		var a = note(userA, "Note A", f);
		var b = note(userA, "Note B", s);
		var c = note(userA, "Note C", null);
		trashNote(userA, c);
		trashFolder(userA, f);

		var listed = trash(userA).body();

		assertThat(listed).contains("\"total\":2");
		assertThat(listed).contains("\"kind\":\"FOLDER\"").contains("\"title\":\"Projects\"")
				.contains("\"folderCount\":1").contains("\"itemCount\":2");
		assertThat(listed).contains("\"kind\":\"NOTE\"").contains("Note C").contains("\"id\":\"" + c + "\"");
		// What was deleted together with the Folder shows as counts under it, not as rows of its own.
		assertThat(listed).doesNotContain("Note A").doesNotContain("Note B").doesNotContain("\"title\":\"Sub\"");
		assertThat(listed).contains("\"id\":\"" + f + "\"").doesNotContain(a).doesNotContain(b).doesNotContain(s);
		assertThat(listed.split("\"daysRemaining\":30", -1).length - 1).isEqualTo(2);

		clock.advance(Duration.ofDays(10));
		assertThat(trash(userA).body()).contains("\"daysRemaining\":20");
		clock.advance(Duration.ofDays(19).plusHours(12));
		assertThat(trash(userA).body()).contains("\"daysRemaining\":1");
	}

	@Test
	void anAssetShowsInTheTrashWithItsOwnKind() throws Exception {
		var id = asset(userA, "scan.png", 100);
		assertThat(delete("/api/assets/" + id, userA).statusCode()).isEqualTo(204);

		assertThat(trash(userA).body()).contains("\"kind\":\"ASSET\"").contains("scan.png");
	}

	@Test
	void restoringAnItemRestoresItsTrashedFoldersButNotTheirOtherContents() throws Exception {
		var f = folder(userA, "F", null);
		var s = folder(userA, "S", f);
		var n = note(userA, "N", s);
		var m = note(userA, "M", f);
		trashNote(userA, n);
		trashFolder(userA, f);

		assertThat(restoreItem(userA, n)).isEqualTo(204);

		assertThat(live(userA, n)).isTrue();
		assertThat(get("/api/folders", userA).body()).contains("\"total\":2").contains("\"id\":\"" + f + "\"")
				.contains("\"id\":\"" + s + "\"");
		assertThat(get("/api/items?folderId=" + s, userA).body()).contains("\"id\":\"" + n + "\"");
		// M was deleted with F, and stays in the Trash (now as a root of its own).
		assertThat(live(userA, m)).isFalse();
		var listed = trash(userA).body();
		assertThat(listed).contains("\"total\":1").contains("\"id\":\"" + m + "\"");
	}

	@Test
	void restoringAFolderRestoresExactlyItsBatch() throws Exception {
		var f = folder(userA, "F", null);
		var s = folder(userA, "S", f);
		var n = note(userA, "N", s);
		var m = note(userA, "M", f);
		trashNote(userA, n);
		trashFolder(userA, f);

		assertThat(restoreFolder(userA, f)).isEqualTo(204);

		assertThat(get("/api/folders", userA).body()).contains("\"total\":2");
		assertThat(live(userA, m)).isTrue();
		// N was deleted before F, in a batch of its own: it stays in the Trash.
		assertThat(live(userA, n)).isFalse();
		assertThat(trash(userA).body()).contains("\"total\":1").contains("\"id\":\"" + n + "\"");
	}

	@Test
	void restoringAFolderAlsoRestoresATrashedParentSoItIsNeverHidden() throws Exception {
		var p = folder(userA, "P", null);
		var c = folder(userA, "C", p);
		var q = note(userA, "Q", p);
		trashFolder(userA, c);
		trashFolder(userA, p);

		assertThat(restoreFolder(userA, c)).isEqualTo(204);

		var folders = get("/api/folders", userA).body();
		assertThat(folders).contains("\"total\":2").contains("\"id\":\"" + p + "\"")
				.contains("\"id\":\"" + c + "\"");
		assertThat(live(userA, q)).isFalse();
	}

	@Test
	void aLinkToARestoredItemResolvesAgain() throws Exception {
		var target = note(userA, "Target", null);
		var source = note(userA, "Source", null);
		put("/api/notes/" + source, userA, "{\"title\":\"Source\",\"body\":\"see [[" + target + "|Target]]\",\"version\":1}");
		trashNote(userA, target);
		assertThat(post("/api/links/resolve", userA, "{\"ids\":[\"" + target + "\"]}").body()).doesNotContain(target);

		assertThat(restoreItem(userA, target)).isEqualTo(204);

		assertThat(post("/api/links/resolve", userA, "{\"ids\":[\"" + target + "\"]}").body()).contains(target)
				.contains("\"title\":\"Target\"");
		assertThat(get("/api/items/" + target + "/backlinks", userA).body()).contains(source);
	}

	@Test
	void onlyTrashedThingsOfTheUserCanBeRestoredOrDeletedForGood() throws Exception {
		var live = note(userA, "Live", null);
		var liveFolder = folder(userA, "LiveF", null);
		var trashed = note(userA, "Trashed", null);
		var trashedFolder = folder(userA, "TrashedF", null);
		trashNote(userA, trashed);
		trashFolder(userA, trashedFolder);

		// A live thing is not in the Trash: 404 for every trash operation.
		assertThat(restoreItem(userA, live)).isEqualTo(404);
		assertThat(restoreFolder(userA, liveFolder)).isEqualTo(404);
		assertThat(delete("/api/trash/items/" + live, userA).statusCode()).isEqualTo(404);
		assertThat(delete("/api/trash/folders/" + liveFolder, userA).statusCode()).isEqualTo(404);
		assertThat(restoreItem(userA, UUID.randomUUID().toString())).isEqualTo(404);
		// Another User's Trash is invisible and untouchable.
		assertThat(restoreItem(userB, trashed)).isEqualTo(404);
		assertThat(restoreFolder(userB, trashedFolder)).isEqualTo(404);
		assertThat(delete("/api/trash/items/" + trashed, userB).statusCode()).isEqualTo(404);
		assertThat(delete("/api/trash/folders/" + trashedFolder, userB).statusCode()).isEqualTo(404);
		assertThat(trash(userB).body()).contains("\"total\":0");
		assertThat(delete("/api/trash", userB).statusCode()).isEqualTo(204);
		assertThat(trash(userA).body()).contains("\"total\":2");
		assertThat(itemRowExists(trashed)).isTrue();
		assertThat(folderRowExists(trashedFolder)).isTrue();
	}

	@Test
	void deletingANoteForGoodRemovesItAndTheLinksPointingAtIt() throws Exception {
		var target = note(userA, "Target", null);
		var source = note(userA, "Source", null);
		put("/api/notes/" + source, userA, "{\"title\":\"Source\",\"body\":\"[[" + target + "|Target]]\",\"version\":1}");
		trashNote(userA, target);

		assertThat(delete("/api/trash/items/" + target, userA).statusCode()).isEqualTo(204);

		assertThat(itemRowExists(target)).isFalse();
		assertThat(jdbc.sql("select count(*) from note_contents where item_id = :id")
				.param("id", UUID.fromString(target)).query(Long.class).single()).isZero();
		assertThat(jdbc.sql("select count(*) from links where target_id = :id").param("id", UUID.fromString(target))
				.query(Long.class).single()).isZero();
		assertThat(trash(userA).body()).contains("\"total\":0");
		assertThat(live(userA, source)).isTrue();
		assertThat(restoreItem(userA, target)).isEqualTo(404);
	}

	@Test
	void deletingAnAssetForGoodRemovesItsFileAndFreesTheQuota() throws Exception {
		jdbc.sql("update users set storage_quota_bytes = 10000 where email = 'a@example.com'").update();
		var id = asset(userA, "big.png", 6000);
		var key = keyOf(id);
		assertThat(delete("/api/assets/" + id, userA).statusCode()).isEqualTo(204);
		assertThat(get("/api/assets/usage", userA).body()).contains("\"usedBytes\":6000");

		assertThat(delete("/api/trash/items/" + id, userA).statusCode()).isEqualTo(204);

		assertThat(storage.exists(key)).isFalse();
		assertThat(itemRowExists(id)).isFalse();
		assertThat(get("/api/assets/usage", userA).body()).contains("\"usedBytes\":0");
		assertThat(post("/api/assets/uploads", userA,
				"{\"filename\":\"next.png\",\"mimeType\":\"image/png\",\"sizeBytes\":9000}").statusCode())
				.isEqualTo(201);
	}

	@Test
	void deletingAFolderForGoodRemovesItsBatchAndKeepsWhatWasTrashedSeparately() throws Exception {
		var f = folder(userA, "F", null);
		var s = folder(userA, "S", f);
		var n = note(userA, "N", f);
		var m = note(userA, "M", f);
		var x = asset(userA, "x.png", 100);
		post("/api/items/" + x + "/move", userA, "{\"folderId\":\"" + f + "\"}");
		var key = keyOf(x);
		trashFolder(userA, s);
		trashNote(userA, n);
		trashFolder(userA, f);

		assertThat(delete("/api/trash/folders/" + f, userA).statusCode()).isEqualTo(204);

		// F's own batch is gone: the Folder, its Note and its Asset (with the file).
		assertThat(folderRowExists(f)).isFalse();
		assertThat(itemRowExists(m)).isFalse();
		assertThat(itemRowExists(x)).isFalse();
		assertThat(storage.exists(key)).isFalse();
		// S and N were trashed on their own earlier: they survive, now at the top of the Trash.
		assertThat(folderRowExists(s)).isTrue();
		assertThat(itemRowExists(n)).isTrue();
		var listed = trash(userA).body();
		assertThat(listed).contains("\"total\":2").contains("\"id\":\"" + s + "\"").contains("\"id\":\"" + n + "\"");
		assertThat(jdbc.sql("select parent_id is null from folders where id = :id").param("id", UUID.fromString(s))
				.query(Boolean.class).single()).isTrue();
		assertThat(restoreFolder(userA, s)).isEqualTo(204);
		assertThat(get("/api/folders", userA).body()).contains("\"id\":\"" + s + "\"");
	}

	@Test
	void emptyingTheTrashRemovesEverythingTrashedAndNothingElse() throws Exception {
		var liveNote = note(userA, "Live", null);
		var liveFolder = folder(userA, "LiveF", null);
		var liveAsset = asset(userA, "live.png", 10);
		var gone = note(userA, "Gone", null);
		var goneAsset = asset(userA, "gone.png", 10);
		var goneKey = keyOf(goneAsset);
		var goneFolder = folder(userA, "GoneF", null);
		var inside = note(userA, "Inside", goneFolder);
		var otherUsers = note(userB, "Bs", null);
		trashNote(userA, gone);
		delete("/api/assets/" + goneAsset, userA);
		trashFolder(userA, goneFolder);
		trashNote(userB, otherUsers);

		assertThat(delete("/api/trash", userA).statusCode()).isEqualTo(204);

		assertThat(trash(userA).body()).contains("\"total\":0");
		for (var id : new String[] { gone, goneAsset, inside }) {
			assertThat(itemRowExists(id)).as(id).isFalse();
		}
		assertThat(folderRowExists(goneFolder)).isFalse();
		assertThat(storage.exists(goneKey)).isFalse();
		assertThat(live(userA, liveNote)).isTrue();
		assertThat(get("/api/folders", userA).body()).contains(liveFolder);
		assertThat(get("/api/assets/" + liveAsset, userA).statusCode()).isEqualTo(200);
		// B's Trash is not A's business.
		assertThat(trash(userB).body()).contains("\"total\":1");
	}

	@Test
	void ifStorageIsDownNothingIsDeletedAndTryingAgainWorks() throws Exception {
		var id = asset(userA, "keep.png", 100);
		var key = keyOf(id);
		delete("/api/assets/" + id, userA);
		storage.setDown(true);

		var refused = delete("/api/trash/items/" + id, userA);

		assertThat(refused.statusCode()).isEqualTo(503);
		assertThat(refused.body()).contains("\"code\":\"STORAGE_UNAVAILABLE\"");
		assertThat(delete("/api/trash", userA).statusCode()).isEqualTo(503);
		assertThat(itemRowExists(id)).isTrue();
		assertThat(trash(userA).body()).contains("\"total\":1");
		storage.setDown(false);
		assertThat(storage.exists(key)).isTrue();
		assertThat(delete("/api/trash/items/" + id, userA).statusCode()).isEqualTo(204);
		assertThat(itemRowExists(id)).isFalse();
		assertThat(storage.exists(key)).isFalse();
	}

	@Test
	void thePurgeJobRemovesOnlyThingsTrashedMoreThanThirtyDaysAgo() throws Exception {
		var oldNote = note(userA, "Old note", null);
		var oldAsset = asset(userA, "old.png", 100);
		var oldKey = keyOf(oldAsset);
		var oldFolder = folder(userA, "Old folder", null);
		var inOldFolder = note(userA, "In old folder", oldFolder);
		var bsOld = note(userB, "Bs old", null);
		var liveNote = note(userA, "Live", null);
		trashNote(userA, oldNote);
		delete("/api/assets/" + oldAsset, userA);
		trashFolder(userA, oldFolder);
		trashNote(userB, bsOld);

		clock.advance(Duration.ofDays(20));
		var newer = note(userA, "Newer", null);
		trashNote(userA, newer);
		clock.advance(Duration.ofDays(9));
		assertThat(purge.run()).as("29 days after the first deletions").isZero();
		assertThat(itemRowExists(oldNote)).isTrue();
		assertThat(storage.exists(oldKey)).isTrue();

		clock.advance(Duration.ofDays(2));
		var removed = purge.run();

		// 31 days: everything from the first day goes, for every User, with the file; the 11 day old Note stays.
		assertThat(removed).isEqualTo(5);
		for (var id : new String[] { oldNote, oldAsset, inOldFolder, bsOld }) {
			assertThat(itemRowExists(id)).as(id).isFalse();
		}
		assertThat(folderRowExists(oldFolder)).isFalse();
		assertThat(storage.exists(oldKey)).isFalse();
		assertThat(itemRowExists(newer)).isTrue();
		assertThat(trash(userA).body()).contains("\"total\":1").contains("\"daysRemaining\":19");
		assertThat(live(userA, liveNote)).isTrue();
		// Running again changes nothing.
		assertThat(purge.run()).isZero();
	}

	@Test
	void thePurgeJobLeavesAnAssetWhoseFileCannotBeDeletedAndRetriesLater() throws Exception {
		var id = asset(userA, "stuck.png", 100);
		var key = keyOf(id);
		delete("/api/assets/" + id, userA);
		clock.advance(Duration.ofDays(31));
		storage.setDown(true);

		assertThat(purge.run()).isZero();

		assertThat(itemRowExists(id)).isTrue();
		assertThat(storage.exists(key)).isTrue();
		storage.setDown(false);
		assertThat(purge.run()).isEqualTo(1);
		assertThat(itemRowExists(id)).isFalse();
		assertThat(storage.exists(key)).isFalse();
	}

	@Test
	void theTrashNeedsASignedInUser() throws Exception {
		assertThat(get("/api/trash").statusCode()).isEqualTo(401);
		assertThat(delete("/api/trash", null).statusCode()).isEqualTo(401);
		assertThat(post("/api/trash/items/" + UUID.randomUUID() + "/restore", null, null).statusCode())
				.isEqualTo(401);
	}

}
