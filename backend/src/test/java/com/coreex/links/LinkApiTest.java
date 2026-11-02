package com.coreex.links;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class LinkApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	private String userA;

	private String userB;

	@BeforeEach
	void cleanDatabase() {
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

	private String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private static String json(String text) {
		return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
	}

	private String note(String token, String title, String body) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + json(title) + "\",\"body\":\"" + json(body) + "\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	/** Saves a Note's text (it must be at version 1 or 2, tracked by the caller) and returns the response. */
	private HttpResponse<String> save(String token, String id, String title, String body, int version)
			throws Exception {
		return put("/api/notes/" + id, token,
				"{\"title\":\"" + json(title) + "\",\"body\":\"" + json(body) + "\",\"version\":" + version + "}");
	}

	private String storedBody(String id) {
		return jdbc.sql("select body from note_contents where item_id = :id").param("id", UUID.fromString(id))
				.query(String.class).single();
	}

	private HttpResponse<String> resolve(String token, String... ids) throws Exception {
		var list = String.join(",", java.util.Arrays.stream(ids).map(i -> "\"" + i + "\"").toList());
		return post("/api/links/resolve", token, "{\"ids\":[" + list + "]}");
	}

	private String backlinks(String token, String id) throws Exception {
		var response = get("/api/items/" + id + "/backlinks", token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	@Test
	void backlinksFollowEverySave() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "");
		assertThat(backlinks(userA, target)).contains("\"total\":0");

		var saved = save(userA, source, "Source", "see [[" + target + "|Target]]", 1);
		assertThat(saved.statusCode()).isEqualTo(200);

		var listed = backlinks(userA, target);
		assertThat(listed).contains("\"total\":1").contains("\"id\":\"" + source + "\"").contains("Source");

		// Taking the Link out of the text takes the Backlink away.
		save(userA, source, "Source", "no links now", 2);
		assertThat(backlinks(userA, target)).contains("\"total\":0");
	}

	@Test
	void aNoteCreatedWithLinksIsIndexedToo() throws Exception {
		var target = note(userA, "Target", "");

		var source = note(userA, "Source", "[[" + target + "|T]]");

		assertThat(backlinks(userA, target)).contains("\"id\":\"" + source + "\"");
	}

	@Test
	void linkingTwiceToTheSameItemIsOneBacklink() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "[[" + target + "|T]] and again [[" + target + "|T]]");

		var listed = backlinks(userA, target);

		assertThat(listed).contains("\"total\":1");
		assertThat(source).isNotBlank();
	}

	@Test
	void aHandTypedTitleIsRewrittenWhenExactlyOneLiveItemMatches() throws Exception {
		var target = note(userA, "Exact Title", "");
		var source = note(userA, "Source", "");

		var saved = save(userA, source, "Source", "go to [[Exact Title]] please", 1);

		var rewritten = "go to [[" + target + "|Exact Title]] please";
		assertThat(saved.body()).contains("\"body\":\"" + rewritten + "\"");
		assertThat(storedBody(source)).isEqualTo(rewritten);
		assertThat(backlinks(userA, target)).contains("\"id\":\"" + source + "\"");
	}

	@Test
	void aHandTypedTitleStaysAsWrittenWithNoMatchSeveralMatchesOrATrashedMatch() throws Exception {
		note(userA, "Twin", "");
		note(userA, "Twin", "");
		var trashed = note(userA, "Gone", "");
		delete("/api/notes/" + trashed, userA);
		var source = note(userA, "Source", "");
		var text = "[[Nobody]] [[Twin]] [[Gone]] [[twin]]";

		save(userA, source, "Source", text, 1);

		assertThat(storedBody(source)).isEqualTo(text);
	}

	@Test
	void aHandTypedTitleNeverResolvesToAnotherUsersItem() throws Exception {
		var bItem = note(userB, "Shared Name", "");
		var source = note(userA, "Source", "");

		save(userA, source, "Source", "[[Shared Name]]", 1);

		assertThat(storedBody(source)).isEqualTo("[[Shared Name]]");
		assertThat(backlinks(userB, bItem)).contains("\"total\":0");
	}

	@Test
	void hiddenCodeIsLeftAlone() throws Exception {
		note(userA, "Exact Title", "");
		var source = note(userA, "Source", "");
		var text = "`[[Exact Title]]`\n```\n[[Exact Title]]\n```";

		save(userA, source, "Source", text, 1);

		assertThat(storedBody(source)).isEqualTo(text);
	}

	@Test
	void aLinkKeepsWorkingAfterItsTargetIsRenamedAndMoved() throws Exception {
		var target = note(userA, "Old Name", "");
		var source = note(userA, "Source", "");
		save(userA, source, "Source", "[[" + target + "|Old Name]]", 1);
		var folder = field(post("/api/folders", userA, "{\"name\":\"Work\"}").body(), "id");
		var sub = field(post("/api/folders", userA, "{\"name\":\"CoreEx\",\"parentId\":\"" + folder + "\"}").body(), "id");

		save(userA, target, "New Name", "", 1);
		assertThat(post("/api/items/" + target + "/move", userA, "{\"folderId\":\"" + sub + "\"}").statusCode())
				.isEqualTo(200);

		var resolved = resolve(userA, target);
		assertThat(resolved.statusCode()).isEqualTo(200);
		assertThat(resolved.body()).contains("\"title\":\"New Name\"").contains("\"type\":\"NOTE\"")
				.contains("\"folderPath\":\"Work / CoreEx\"").doesNotContain("Old Name");
		assertThat(backlinks(userA, target)).contains("\"id\":\"" + source + "\"");
	}

	@Test
	void trashedOrMissingTargetsDoNotResolveAndComeBackOnRestore() throws Exception {
		var target = note(userA, "Target", "");
		var missing = UUID.randomUUID().toString();
		var source = note(userA, "Source", "[[" + target + "|Target]] [[" + missing + "|Nothing]]");

		assertThat(resolve(userA, target, missing).body()).contains(target).doesNotContain(missing);

		delete("/api/notes/" + target, userA);
		assertThat(resolve(userA, target, missing).body()).doesNotContain(target).doesNotContain(missing);
		assertThat(get("/api/items/" + target + "/backlinks", userA).statusCode()).isEqualTo(404);

		// Restoring (no screen for it yet) makes the same Link resolve again; the index was never touched.
		jdbc.sql("update items set deleted_at = null, trash_batch_id = null where id = :id")
				.param("id", UUID.fromString(target)).update();
		assertThat(resolve(userA, target).body()).contains(target);
		assertThat(backlinks(userA, target)).contains("\"id\":\"" + source + "\"");
	}

	@Test
	void aTrashedNoteIsNotListedAsABacklink() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "[[" + target + "|T]]");
		delete("/api/notes/" + source, userA);

		assertThat(backlinks(userA, target)).contains("\"total\":0");
	}

	@Test
	void anotherUsersItemsNeverResolveOrAppearAnywhere() throws Exception {
		var bItem = note(userB, "Secret Plan", "");
		var aNote = note(userA, "Mine", "[[" + bItem + "|Secret Plan]]");

		// A cannot resolve B's Item, find it by title, or see B's Backlinks.
		assertThat(resolve(userA, bItem).body()).doesNotContain(bItem).doesNotContain("Secret");
		assertThat(get("/api/links/suggestions?q=secret", userA).body()).doesNotContain("Secret");
		assertThat(get("/api/items/" + bItem + "/backlinks", userA).statusCode()).isEqualTo(404);
		// B's Backlinks do not list A's Note, even though A's text points at B's id.
		assertThat(backlinks(userB, bItem)).contains("\"total\":0").doesNotContain(aNote);
		// B cannot read A's Note's Backlinks either.
		assertThat(get("/api/items/" + aNote + "/backlinks", userB).statusCode()).isEqualTo(404);
	}

	@Test
	void suggestionsListLiveItemsByTitleWithTypeAndFolderPath() throws Exception {
		var folder = field(post("/api/folders", userA, "{\"name\":\"Work\"}").body(), "id");
		var inFolder = field(post("/api/notes", userA, "{\"title\":\"Research plan\",\"folderId\":\"" + folder + "\"}")
				.body(), "id");
		note(userA, "Weekly research", "");
		var gone = note(userA, "Researched and gone", "");
		delete("/api/notes/" + gone, userA);
		note(userA, "Unrelated", "");

		var found = get("/api/links/suggestions?q=Research", userA);

		assertThat(found.statusCode()).isEqualTo(200);
		assertThat(found.body()).contains("Research plan").contains("Weekly research").doesNotContain("gone")
				.doesNotContain("Unrelated").contains("\"type\":\"NOTE\"").contains("\"folderPath\":\"Work\"");
		// Titles that start with the text come first.
		assertThat(found.body().indexOf("Research plan")).isLessThan(found.body().indexOf("Weekly research"));
		assertThat(found.body()).contains(inFolder);
	}

	@Test
	void suggestionsTreatPercentAndUnderscoreAsPlainText() throws Exception {
		note(userA, "100% done", "");
		note(userA, "Anything", "");

		assertThat(get("/api/links/suggestions?q=%25", userA).body()).contains("100% done")
				.doesNotContain("Anything");
		assertThat(get("/api/links/suggestions?q=_", userA).body()).contains("\"items\":[]");
	}

	@Test
	void anEmptyQueryListsRecentItems() throws Exception {
		note(userA, "Alpha", "");

		assertThat(get("/api/links/suggestions", userA).body()).contains("Alpha");
	}

	@Test
	void invalidRequestsGet400() throws Exception {
		assertThat(post("/api/links/resolve", userA, "{\"ids\":[\"nope\"]}").statusCode()).isEqualTo(400);
		assertThat(post("/api/links/resolve", userA, "{}").statusCode()).isEqualTo(400);
		var tooMany = String.join(",", java.util.Collections.nCopies(101, "\"" + UUID.randomUUID() + "\""));
		assertThat(post("/api/links/resolve", userA, "{\"ids\":[" + tooMany + "]}").statusCode()).isEqualTo(400);
	}

	@Test
	void linksNeedASignedInUser() throws Exception {
		assertThat(get("/api/links/suggestions").statusCode()).isEqualTo(401);
		assertThat(post("/api/links/resolve", null, "{\"ids\":[]}").statusCode()).isEqualTo(401);
	}

	private String graph(String token) throws Exception {
		return graph(token, null);
	}

	private String graph(String token, String folderId) throws Exception {
		var response = get("/api/links/graph" + (folderId == null ? "" : "?folderId=" + folderId), token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	@Test
	void theGraphHasEveryLiveItemAndTheLinksBetweenThem() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "[[" + target + "|T]]");
		var lonely = note(userA, "Lonely", "");

		var body = graph(userA);

		assertThat(body).contains("\"id\":\"" + target + "\"", "\"id\":\"" + source + "\"",
				"\"id\":\"" + lonely + "\"", "\"truncated\":false");
		assertThat(body).contains("\"source\":\"" + source + "\",\"target\":\"" + target + "\"");
	}

	@Test
	void theGraphLeavesOutTrashedItemsAndTheirLinks() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "[[" + target + "|T]]");
		delete("/api/notes/" + target, userA);

		var body = graph(userA);

		assertThat(body).contains(source).doesNotContain(target).contains("\"edges\":[]");
	}

	@Test
	void theGraphNeverShowsAnotherUsersItemsOrLinksIntoThem() throws Exception {
		var bItem = note(userB, "B Item", "");
		var aItem = note(userA, "A Item", "");
		jdbc.sql("insert into links (source_id, target_id) values (:s, :t)").param("s", UUID.fromString(aItem))
				.param("t", UUID.fromString(bItem)).update();

		var body = graph(userA);

		assertThat(body).contains(aItem).doesNotContain(bItem).contains("\"edges\":[]");
		assertThat(graph(userB)).doesNotContain(aItem).contains("\"edges\":[]");
	}

	@Test
	void aFolderGraphHasItsSubfoldersAndShowsOutsideItemsAsStubs() throws Exception {
		var folder = field(post("/api/folders", userA, "{\"name\":\"Physics\"}").body(), "id");
		var sub = field(post("/api/folders", userA, "{\"name\":\"Waves\",\"parentId\":\"" + folder + "\"}").body(),
				"id");
		var other = field(post("/api/folders", userA, "{\"name\":\"Chemistry\"}").body(), "id");
		var outside = note(userA, "Atoms", "");
		jdbc.sql("update items set folder_id = :f where id = :i").param("f", UUID.fromString(other))
				.param("i", UUID.fromString(outside)).update();
		var deep = note(userA, "Sound", "");
		jdbc.sql("update items set folder_id = :f where id = :i").param("f", UUID.fromString(sub))
				.param("i", UUID.fromString(deep)).update();
		var inside = field(post("/api/notes", userA, "{\"title\":\"Energy\",\"folderId\":\"" + folder
				+ "\",\"body\":\"[[" + deep + "|S]] [[" + outside + "|A]]\"}").body(), "id");
		var unrelated = note(userA, "Unrelated", "");

		var body = graph(userA, folder);

		assertThat(body).contains(inside, deep, outside).doesNotContain(unrelated);
		assertThat(body).contains("\"id\":\"" + outside + "\",\"type\":\"NOTE\",\"title\":\"Atoms\","
				+ "\"folderPath\":\"Chemistry\",\"linkCount\":1,\"stub\":true");
		assertThat(body).contains("\"id\":\"" + deep + "\",\"type\":\"NOTE\",\"title\":\"Sound\","
				+ "\"folderPath\":\"Physics / Waves\",\"linkCount\":1,\"stub\":false");
		assertThat(body).contains("\"source\":\"" + inside + "\",\"target\":\"" + outside + "\"", "\"total\":3");
	}

	@Test
	void anotherUsersFolderHasNoGraph() throws Exception {
		var folder = field(post("/api/folders", userB, "{\"name\":\"Mine\"}").body(), "id");

		assertThat(get("/api/links/graph?folderId=" + folder, userA).statusCode()).isEqualTo(404);
	}

	@Test
	void theGraphIsCutAtTheCapKeepingTheMostLinkedAndSaysSo() throws Exception {
		var target = note(userA, "Hub", "");
		note(userA, "Source", "[[" + target + "|H]]");
		var owner = jdbc.sql("select id from users where email = 'a@example.com'").query(UUID.class).single();
		jdbc.sql("insert into items (owner_id, type, title) select :o, 'NOTE', 'n' || g from generate_series(1, 500) g")
				.param("o", owner).update();

		var body = graph(userA);

		assertThat(body).contains("\"truncated\":true", "\"total\":502", target)
				.contains("\"source\":\"");
		assertThat(Pattern.compile("\"stub\":").matcher(body).results().count()).isEqualTo(500);
	}

	@Test
	void theGraphNeedsASignedInUser() throws Exception {
		assertThat(get("/api/links/graph").statusCode()).isEqualTo(401);
	}

}
