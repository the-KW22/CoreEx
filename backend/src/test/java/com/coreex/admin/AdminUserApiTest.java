package com.coreex.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestAuthAccounts;
import com.coreex.TestStorage;

class AdminUserApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestStorage storage;

	@Autowired
	TestAuthAccounts authAccounts;

	private final String admin = TestJwts.tokenFor(UUID.randomUUID(), "owner@example.com");

	private String adminId;

	private String bToken;

	private String bId;

	private String cToken;

	private String cId;

	@BeforeEach
	void cleanDatabase() throws Exception {
		jdbc.sql("delete from users").update();
		jdbc.sql("delete from invites").update();
		storage.clear();
		authAccounts.clear();
		// The first request of the owner provisions the Admin.
		assertThat(get("/api/me", admin).statusCode()).isEqualTo(200);
		adminId = jdbc.sql("select id from users where email = 'owner@example.com'").query(UUID.class).single()
				.toString();
		bId = UUID.randomUUID().toString();
		bToken = insertUser(bId, "b@example.com");
		cId = UUID.randomUUID().toString();
		cToken = insertUser(cId, "c@example.com");
	}

	private String insertUser(String id, String email) {
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", UUID.fromString(id))
				.param("email", email).update();
		return TestJwts.tokenFor(UUID.fromString(id), email);
	}

	private String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private String note(String token, String title, String body, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		var created = post("/api/notes", token,
				"{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"folderId\":" + folder + "}");
		assertThat(created.statusCode()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String asset(String token, String filename, long size, String description) throws Exception {
		var started = post("/api/assets/uploads", token,
				"{\"filename\":\"" + filename + "\",\"mimeType\":\"image/png\",\"sizeBytes\":" + size + "}");
		assertThat(started.statusCode()).as(started.body()).isEqualTo(201);
		var uploadId = field(started.body(), "uploadId");
		storage.put(jdbc.sql("select storage_key from pending_uploads where id = :id")
				.param("id", UUID.fromString(uploadId)).query(String.class).single(), size, "image/png");
		var confirmed = post("/api/assets/uploads/" + uploadId + "/confirm", token, null);
		assertThat(confirmed.statusCode()).isEqualTo(201);
		var id = field(confirmed.body(), "id");
		put("/api/assets/" + id, token, "{\"title\":\"" + filename + "\",\"description\":\"" + description + "\"}");
		return id;
	}

	/** The JSON object of one User in the list (its objects have no nested braces). */
	private String row(String email) throws Exception {
		var list = get("/api/admin/users", admin);
		assertThat(list.statusCode()).isEqualTo(200);
		var matcher = Pattern.compile("\\{[^{}]*\"email\":\"" + Pattern.quote(email) + "\"[^{}]*}").matcher(list.body());
		assertThat(matcher.find()).as(list.body()).isTrue();
		return matcher.group();
	}

	private HttpResponse<String> setQuota(String userId, String json) throws Exception {
		return put("/api/admin/users/" + userId + "/quota", admin, json);
	}

	@Test
	void theUsersListShowsEachUsersItemCountAndStorageUsedAgainstTheQuota() throws Exception {
		note(bToken, "One", "x", null);
		var trashedNote = note(bToken, "Two", "x", null);
		var kept = asset(bToken, "kept.png", 3000, "");
		var trashedAsset = asset(bToken, "trashed.png", 2000, "");
		delete("/api/notes/" + trashedNote, bToken);
		delete("/api/assets/" + trashedAsset, bToken);

		var list = get("/api/admin/users", admin);

		assertThat(list.statusCode()).isEqualTo(200);
		assertThat(list.body()).contains("\"total\":3");
		var b = row("b@example.com");
		// Live Items: one Note and one Asset. Storage used includes the Asset in the Trash.
		assertThat(b).contains("\"itemCount\":2").contains("\"storageUsedBytes\":5000")
				.contains("\"storageQuotaBytes\":104857600").contains("\"customQuota\":false")
				.contains("\"role\":\"USER\"").contains("\"status\":\"ACTIVE\"").contains("\"createdAt\":\"")
				.contains("\"lastActiveAt\":");
		var c = row("c@example.com");
		assertThat(c).contains("\"itemCount\":0").contains("\"storageUsedBytes\":0").contains("\"lastActiveAt\":null");
		assertThat(row("owner@example.com")).contains("\"role\":\"ADMIN\"");
		assertThat(kept).isNotBlank();
	}

	@Test
	void theUsersListIsPagedNewestSignUpFirst() throws Exception {
		jdbc.sql("update users set created_at = now() - interval '3 days' where email = 'c@example.com'").update();
		jdbc.sql("update users set created_at = now() - interval '2 days' where email = 'b@example.com'").update();

		var first = get("/api/admin/users?size=1&page=0", admin).body();
		var last = get("/api/admin/users?size=1&page=2", admin).body();

		assertThat(first).contains("\"total\":3").contains("owner@example.com");
		assertThat(last).contains("c@example.com");
		assertThat(get("/api/admin/users?size=1&page=3", admin).body()).contains("\"items\":[]");
	}

	@Test
	void anAdminCanSetAndResetAUsersQuotaAndNewUploadsRespectIt() throws Exception {
		var changed = setQuota(bId, "{\"storageQuotaBytes\":10000}");

		assertThat(changed.statusCode()).isEqualTo(200);
		assertThat(changed.body()).contains("\"storageQuotaBytes\":10000").contains("\"customQuota\":true")
				.contains("b@example.com");
		assertThat(row("b@example.com")).contains("\"storageQuotaBytes\":10000").contains("\"customQuota\":true");
		// New uploads respect it at once.
		var refused = post("/api/assets/uploads", bToken,
				"{\"filename\":\"big.png\",\"mimeType\":\"image/png\",\"sizeBytes\":20000}");
		assertThat(refused.statusCode()).isEqualTo(413);
		assertThat(refused.body()).contains("\"code\":\"QUOTA_EXCEEDED\"");
		assertThat(post("/api/assets/uploads", bToken,
				"{\"filename\":\"ok.png\",\"mimeType\":\"image/png\",\"sizeBytes\":9000}").statusCode()).isEqualTo(201);
		// Another User is not affected.
		assertThat(row("c@example.com")).contains("\"storageQuotaBytes\":104857600");

		// DELETE puts the User back on the configured default; 0 is a quota too.
		var reset = delete("/api/admin/users/" + bId + "/quota", admin);
		assertThat(reset.statusCode()).isEqualTo(200);
		assertThat(reset.body()).contains("\"storageQuotaBytes\":104857600").contains("\"customQuota\":false");
		assertThat(setQuota(bId, "{\"storageQuotaBytes\":0}").body()).contains("\"storageQuotaBytes\":0")
				.contains("\"customQuota\":true");
	}

	@Test
	void aQuotaMustBeBetweenZeroAndOneTerabyteAndTheUserMustExist() throws Exception {
		assertThat(setQuota(bId, "{\"storageQuotaBytes\":-1}").statusCode()).isEqualTo(400);
		assertThat(setQuota(bId, "{\"storageQuotaBytes\":1000000000001}").statusCode()).isEqualTo(400);
		assertThat(setQuota(bId, "{\"storageQuotaBytes\":\"lots\"}").statusCode()).isEqualTo(400);
		// A missing or null value (or a misspelled field) is refused, never read as "reset".
		for (var body : new String[] { "{}", "{\"storageQuotaBytes\":null}", "{\"quota\":5000}" }) {
			assertThat(setQuota(bId, body).statusCode()).as(body).isEqualTo(400);
		}
		assertThat(delete("/api/admin/users/" + UUID.randomUUID() + "/quota", admin).statusCode()).isEqualTo(404);
		assertThat(setQuota(UUID.randomUUID().toString(), "{\"storageQuotaBytes\":100}").statusCode())
				.isEqualTo(404);
		assertThat(row("b@example.com")).contains("\"customQuota\":false");
	}

	@Test
	void disablingAUserBlocksThemAtOnceAndEnablingRestoresThemWithTheirDataUntouched() throws Exception {
		var noteId = note(bToken, "Mine", "keep me", null);
		assertThat(get("/api/notes/" + noteId, bToken).statusCode()).isEqualTo(200);

		var disabled = post("/api/admin/users/" + bId + "/disable", admin, null);

		assertThat(disabled.statusCode()).isEqualTo(200);
		assertThat(disabled.body()).contains("\"status\":\"DISABLED\"");
		for (var path : new String[] { "/api/me", "/api/notes/" + noteId, "/api/items", "/api/assets/usage" }) {
			var blocked = get(path, bToken);
			assertThat(blocked.statusCode()).as(path).isEqualTo(403);
			assertThat(blocked.body()).as(path).contains("\"code\":\"USER_DISABLED\"");
		}
		assertThat(post("/api/notes", bToken, "{}").statusCode()).isEqualTo(403);
		// Their data is untouched, and other Users carry on.
		assertThat(jdbc.sql("select count(*) from items where owner_id = :id").param("id", UUID.fromString(bId))
				.query(Long.class).single()).isEqualTo(1);
		assertThat(get("/api/me", cToken).statusCode()).isEqualTo(200);
		assertThat(row("b@example.com")).contains("\"status\":\"DISABLED\"").contains("\"itemCount\":1");

		var enabled = post("/api/admin/users/" + bId + "/enable", admin, null);

		assertThat(enabled.statusCode()).isEqualTo(200);
		assertThat(enabled.body()).contains("\"status\":\"ACTIVE\"");
		assertThat(get("/api/notes/" + noteId, bToken).body()).contains("keep me");
	}

	@Test
	void anAdminCannotDisableThemselves() throws Exception {
		var refused = post("/api/admin/users/" + adminId + "/disable", admin, null);

		assertThat(refused.statusCode()).isEqualTo(409);
		assertThat(refused.body()).contains("\"code\":\"CANNOT_DISABLE_SELF\"");
		assertThat(get("/api/me", admin).statusCode()).isEqualTo(200);
		assertThat(row("owner@example.com")).contains("\"status\":\"ACTIVE\"");
		// Enabling someone who is already active, or an unknown User, is harmless or a 404.
		assertThat(post("/api/admin/users/" + bId + "/enable", admin, null).statusCode()).isEqualTo(200);
		assertThat(post("/api/admin/users/" + UUID.randomUUID() + "/disable", admin, null).statusCode())
				.isEqualTo(404);
		assertThat(post("/api/admin/users/" + UUID.randomUUID() + "/enable", admin, null).statusCode())
				.isEqualTo(404);
	}

	@Test
	void theOverviewTotalsUsersAndStorageAgainstTheHostingLimit() throws Exception {
		asset(bToken, "b.png", 4000, "");
		var trashed = asset(cToken, "c.png", 1000, "");
		delete("/api/assets/" + trashed, cToken);
		post("/api/admin/users/" + cId + "/disable", admin, null);

		var overview = get("/api/admin/overview", admin);

		assertThat(overview.statusCode()).isEqualTo(200);
		assertThat(overview.body()).contains("\"totalUsers\":3").contains("\"disabledUsers\":1")
				.contains("\"storageUsedBytes\":5000").contains("\"hostingLimitBytes\":1073741824");
	}

	@Test
	void noAdminEndpointEverReturnsContent() throws Exception {
		var secretFolder = field(post("/api/folders", bToken, "{\"name\":\"Hidden folder\"}").body(), "id");
		var secretNote = note(bToken, "Top secret plan", "launch code 1234", secretFolder);
		post("/api/items/" + secretNote + "/tags", bToken, "{\"name\":\"classified\"}");
		var secretAsset = asset(bToken, "blueprint.png", 3000, "secret blueprint of the vault");
		var storageKey = jdbc.sql("select storage_key from asset_files where item_id = :id")
				.param("id", UUID.fromString(secretAsset)).query(String.class).single();
		post("/api/admin/invites", admin, "{\"email\":\"new@example.com\"}");

		var responses = new ArrayList<HttpResponse<String>>();
		responses.add(get("/api/admin/users", admin));
		responses.add(get("/api/admin/users?size=100", admin));
		responses.add(get("/api/admin/overview", admin));
		responses.add(get("/api/admin/invites", admin));
		responses.add(setQuota(bId, "{\"storageQuotaBytes\":50000}"));
		responses.add(delete("/api/admin/users/" + bId + "/quota", admin));
		responses.add(post("/api/admin/users/" + bId + "/disable", admin, null));
		responses.add(post("/api/admin/users/" + bId + "/enable", admin, null));
		// ... and the refusals say nothing about content either.
		responses.add(post("/api/admin/users/" + adminId + "/disable", admin, null));
		responses.add(get("/api/admin/users", bToken));

		var keys = Set.of("items", "total", "id", "email", "role", "status", "createdAt", "lastActiveAt",
				"acceptedAt", "itemCount", "storageUsedBytes", "storageQuotaBytes", "customQuota", "totalUsers",
				"disabledUsers", "hostingLimitBytes", "code", "message");
		for (var response : responses) {
			var body = response.body();
			assertThat(body).doesNotContain("Top secret").doesNotContain("launch code").doesNotContain("Hidden folder")
					.doesNotContain("classified").doesNotContain("blueprint").doesNotContain("secret blueprint")
					.doesNotContain("vault").doesNotContain(storageKey).doesNotContain("http").doesNotContain(secretNote)
					.doesNotContain(secretAsset).doesNotContain(secretFolder);
			var matcher = Pattern.compile("\"([A-Za-z]+)\":").matcher(body);
			List<String> found = new ArrayList<>();
			while (matcher.find()) {
				found.add(matcher.group(1));
			}
			assertThat(found).as(body).isSubsetOf(keys);
		}
	}

	@Test
	void nonAdminsGet403OnEveryEndpointAndNoTokenGets401() throws Exception {
		var someone = UUID.randomUUID().toString();
		var calls = List.<String[]>of(new String[] { "GET", "/api/admin/users" },
				new String[] { "GET", "/api/admin/overview" },
				new String[] { "PUT", "/api/admin/users/" + someone + "/quota" },
				new String[] { "DELETE", "/api/admin/users/" + someone + "/quota" },
				new String[] { "POST", "/api/admin/users/" + someone + "/disable" },
				new String[] { "POST", "/api/admin/users/" + someone + "/enable" },
				new String[] { "DELETE", "/api/admin/users/" + someone });

		for (var call : calls) {
			var asUser = call(call[0], call[1], bToken);
			assertThat(asUser.statusCode()).as(call[1]).isEqualTo(403);
			assertThat(asUser.body()).as(call[1]).contains("\"code\":\"FORBIDDEN\"");
			assertThat(call(call[0], call[1], null).statusCode()).as(call[1]).isEqualTo(401);
		}
		// Nothing changed.
		assertThat(row("b@example.com")).contains("\"status\":\"ACTIVE\"");
	}

	private long count(String table, String id) {
		return jdbc.sql("select count(*) from " + table + " where owner_id = :id").param("id", UUID.fromString(id))
				.query(Long.class).single();
	}

	@Test
	void removingAUserDeletesTheirDataFilesAndSignIn() throws Exception {
		note(bToken, "Gone", "x", null);
		post("/api/folders", bToken, "{\"name\":\"Mine\"}");
		asset(bToken, "gone.png", 3000, "");
		var pending = post("/api/assets/uploads", bToken,
				"{\"filename\":\"half.png\",\"mimeType\":\"image/png\",\"sizeBytes\":10}");
		assertThat(pending.statusCode()).isEqualTo(201);
		storage.put(jdbc.sql("select storage_key from pending_uploads").query(String.class).single(), 10, "image/png");
		note(cToken, "Stays", "x", null);
		var asset = asset(cToken, "stays.png", 2000, "");
		assertThat(storage.keys()).hasSize(3);

		var removed = delete("/api/admin/users/" + bId, admin);

		assertThat(removed.statusCode()).isEqualTo(204);
		assertThat(count("items", bId) + count("folders", bId) + count("pending_uploads", bId)).isZero();
		assertThat(jdbc.sql("select count(*) from users where id = :id").param("id", UUID.fromString(bId))
				.query(Long.class).single()).isZero();
		assertThat(authAccounts.wasDeleted(UUID.fromString(bId))).isTrue();
		// Only C's file is left in Storage, and C is untouched.
		assertThat(storage.keys()).hasSize(1);
		assertThat(count("items", cId)).isEqualTo(2);
		assertThat(authAccounts.wasDeleted(UUID.fromString(cId))).isFalse();
		assertThat(get("/api/assets/" + asset, cToken).statusCode()).isEqualTo(200);
		assertThat(get("/api/admin/users", admin).body()).doesNotContain("b@example.com");
	}

	@Test
	void aRemovedPersonCanBeInvitedAndSignUpAgain() throws Exception {
		jdbc.sql("insert into invites (email, status, accepted_at) values ('b@example.com', 'ACCEPTED', now())")
				.update();
		assertThat(post("/api/admin/invites", admin, "{\"email\":\"b@example.com\"}").statusCode()).isEqualTo(409);

		assertThat(delete("/api/admin/users/" + bId, admin).statusCode()).isEqualTo(204);

		assertThat(post("/api/admin/invites", admin, "{\"email\":\"b@example.com\"}").statusCode()).isEqualTo(201);
		// A new Supabase sign-in (a new id) with that email is accepted.
		var again = TestJwts.tokenFor(UUID.randomUUID(), "b@example.com");
		assertThat(get("/api/me", again).statusCode()).isEqualTo(200);
	}

	@Test
	void anAdminOrYourselfCannotBeRemoved() throws Exception {
		jdbc.sql("update users set role = 'ADMIN' where id = :id").param("id", UUID.fromString(cId)).update();

		for (var id : List.of(adminId, cId)) {
			var refused = delete("/api/admin/users/" + id, admin);
			assertThat(refused.statusCode()).as(id).isEqualTo(409);
			assertThat(refused.body()).contains("\"code\":\"CANNOT_REMOVE_ADMIN\"");
		}
		assertThat(delete("/api/admin/users/" + UUID.randomUUID(), admin).statusCode()).isEqualTo(404);
		assertThat(row("c@example.com")).contains("\"status\":\"ACTIVE\"");
	}

	@Test
	void ifStorageOrSignInFailsNothingIsLostAndARetrySucceeds() throws Exception {
		asset(bToken, "keep.png", 3000, "");

		storage.setDown(true);
		assertThat(delete("/api/admin/users/" + bId, admin).statusCode()).isEqualTo(503);
		storage.setDown(false);
		authAccounts.setDown(true);
		assertThat(delete("/api/admin/users/" + bId, admin).statusCode()).isEqualTo(503);
		authAccounts.setDown(false);

		// Still listed, but disabled, so they are locked out while the removal is unfinished.
		assertThat(row("b@example.com")).contains("\"status\":\"DISABLED\"");
		assertThat(get("/api/me", bToken).statusCode()).isEqualTo(403);
		assertThat(delete("/api/admin/users/" + bId, admin).statusCode()).isEqualTo(204);
		assertThat(storage.keys()).isEmpty();
		assertThat(authAccounts.wasDeleted(UUID.fromString(bId))).isTrue();
	}

	private HttpResponse<String> call(String method, String path, String token) throws Exception {
		return switch (method) {
			case "GET" -> get(path, token);
			case "PUT" -> put(path, token, "{\"storageQuotaBytes\":1}");
			case "DELETE" -> delete(path, token);
			default -> post(path, token, null);
		};
	}

}
