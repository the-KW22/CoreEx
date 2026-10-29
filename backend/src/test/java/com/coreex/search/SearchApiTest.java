package com.coreex.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
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

class SearchApiTest extends ApiTest {

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
		var escaped = new StringBuilder();
		for (var c : text.toCharArray()) {
			switch (c) {
				case '\\' -> escaped.append("\\\\");
				case '"' -> escaped.append("\\\"");
				case '\n' -> escaped.append("\\n");
				// JSON does not allow raw control characters in a string.
				default -> escaped.append(c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c));
			}
		}
		return escaped.toString();
	}

	private String note(String token, String title, String body, String folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		var created = post("/api/notes", token,
				"{\"title\":\"" + json(title) + "\",\"body\":\"" + json(body) + "\",\"folderId\":" + folder + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String note(String token, String title, String body) throws Exception {
		return note(token, title, body, null);
	}

	private String folder(String token, String name, String parentId) throws Exception {
		var parent = parentId == null ? "null" : "\"" + parentId + "\"";
		var created = post("/api/folders", token, "{\"name\":\"" + name + "\",\"parentId\":" + parent + "}");
		assertThat(created.statusCode()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String asset(String token, String filename, String description) throws Exception {
		var started = post("/api/assets/uploads", token,
				"{\"filename\":\"" + filename + "\",\"mimeType\":\"image/png\",\"sizeBytes\":100}");
		assertThat(started.statusCode()).as(started.body()).isEqualTo(201);
		var uploadId = field(started.body(), "uploadId");
		storage.put(jdbc.sql("select storage_key from pending_uploads where id = :id")
				.param("id", UUID.fromString(uploadId)).query(String.class).single(), 100, "image/png");
		var confirmed = post("/api/assets/uploads/" + uploadId + "/confirm", token, null);
		assertThat(confirmed.statusCode()).isEqualTo(201);
		var id = field(confirmed.body(), "id");
		var title = field(confirmed.body(), "title");
		assertThat(put("/api/assets/" + id, token,
				"{\"title\":\"" + title + "\",\"description\":\"" + json(description) + "\"}").statusCode())
				.isEqualTo(200);
		return id;
	}

	private String tag(String token, String itemId, String name) throws Exception {
		var added = post("/api/items/" + itemId + "/tags", token, "{\"name\":\"" + name + "\"}");
		assertThat(added.statusCode()).isEqualTo(200);
		return field(added.body(), "id");
	}

	private static String enc(String text) {
		return URLEncoder.encode(text, StandardCharsets.UTF_8);
	}

	private String search(String token, String query) throws Exception {
		var response = get("/api/search?q=" + enc(query), token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	private String searchWith(String token, String query, String more) throws Exception {
		var response = get("/api/search?q=" + enc(query) + more, token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	private List<String> titles(String json) {
		var titles = new ArrayList<String>();
		var matcher = Pattern.compile("\"title\":\"([^\"]*)\"").matcher(json);
		while (matcher.find()) {
			titles.add(matcher.group(1));
		}
		return titles;
	}

	private List<String> quick(String token, String query) throws Exception {
		var response = get("/api/search/quick?q=" + enc(query), token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return titles(response.body());
	}

	@Test
	void searchFindsNoteTitlesAndBodiesAssetTitlesAndDescriptionsAndTagNames() throws Exception {
		note(userA, "Quarterly report", "figures only");
		note(userA, "Meeting", "we discuss the budget forecast today");
		asset(userA, "chart.png", "a graph of the forecast");
		var tagged = note(userA, "Plain note", "nothing to see");
		tag(userA, tagged, "Forecast");
		note(userA, "Unrelated", "other words");

		var byWord = search(userA, "forecast");

		assertThat(titles(byWord)).containsExactlyInAnyOrder("Meeting", "chart.png", "Plain note");
		assertThat(byWord).contains("\"total\":3");
		assertThat(titles(search(userA, "quarterly"))).containsExactly("Quarterly report");
		assertThat(titles(search(userA, "CHART"))).containsExactly("chart.png");
		assertThat(byWord).contains("\"type\":\"NOTE\"").contains("\"type\":\"ASSET\"");
	}

	@Test
	void aFilenameIsFoundByItsWordsNotOnlyByTheWholeName() throws Exception {
		asset(userA, "Q3_report-final.v2.png", "");

		for (var query : new String[] { "report", "q3", "final", "png", "Q3_report-final.v2.png", "final v2" }) {
			assertThat(titles(search(userA, query))).as(query).containsExactly("Q3_report-final.v2.png");
		}
	}

	@Test
	void trashedItemsNeverAppearNotEvenThroughTheirTags() throws Exception {
		var gone = note(userA, "Gone note", "zebra");
		var tagged = note(userA, "Tagged gone", "plain");
		tag(userA, tagged, "zebra");
		var goneAsset = asset(userA, "zebra.png", "zebra");
		note(userA, "Kept", "zebra");
		delete("/api/notes/" + gone, userA);
		delete("/api/notes/" + tagged, userA);
		delete("/api/assets/" + goneAsset, userA);

		assertThat(titles(search(userA, "zebra"))).containsExactly("Kept");

		// Restored, it is found again.
		assertThat(post("/api/trash/items/" + gone + "/restore", userA, null).statusCode()).isEqualTo(204);
		assertThat(titles(search(userA, "zebra"))).containsExactlyInAnyOrder("Kept", "Gone note");
	}

	@Test
	void anotherUsersItemsNeverAppear() throws Exception {
		var theirs = note(userB, "Secret plan", "zebra zebra");
		tag(userB, theirs, "zebra");
		asset(userB, "zebra.png", "zebra");
		note(userA, "Mine", "zebra");

		assertThat(titles(search(userA, "zebra"))).containsExactly("Mine");
		assertThat(search(userA, "secret")).contains("\"total\":0");
		assertThat(titles(search(userB, "zebra"))).containsExactlyInAnyOrder("Secret plan", "zebra.png");
	}

	@Test
	void wordsMatchExactlyWithoutStemmingAndIgnoringCase() throws Exception {
		note(userA, "Running log", "I am running every day");

		assertThat(search(userA, "running")).contains("\"total\":1");
		assertThat(search(userA, "RUNNING")).contains("\"total\":1");
		assertThat(search(userA, "run")).contains("\"total\":0");
		assertThat(search(userA, "runs")).contains("\"total\":0");
		// Nothing is dropped as a stop word.
		note(userA, "Cats", "The cat sat on the mat");
		assertThat(titles(search(userA, "the"))).containsExactly("Cats");
	}

	@Test
	void textInOtherLanguagesIsFoundByItsExactWords() throws Exception {
		note(userA, "Resipi", "Saya suka makan nasi lemak yang sedap di Kuala Lumpur");
		note(userA, "Café", "Un café très bon");

		for (var query : new String[] { "nasi", "lemak", "yang", "KUALA", "\"nasi lemak\"", "sedap lumpur" }) {
			assertThat(titles(search(userA, query))).as(query).containsExactly("Resipi");
		}
		assertThat(titles(search(userA, "café"))).containsExactly("Café");
		// Accents are not folded: that is how the simple configuration behaves.
		assertThat(search(userA, "cafe")).contains("\"total\":0");
	}

	@Test
	void phrasesAlternativesAndExclusionsWork() throws Exception {
		note(userA, "One", "red apple pie");
		note(userA, "Two", "green apple tart");
		note(userA, "Three", "red grape juice");

		assertThat(titles(search(userA, "\"apple pie\""))).containsExactly("One");
		assertThat(titles(search(userA, "apple tart OR juice"))).containsExactlyInAnyOrder("Two", "Three");
		assertThat(titles(search(userA, "red -apple"))).containsExactly("Three");
		assertThat(titles(search(userA, "red apple"))).containsExactly("One");
	}

	@Test
	void anyTextCanBeSearchedForWithoutAnError() throws Exception {
		note(userA, "Note", "x");

		for (var query : new String[] { "\"unbalanced", "& | ! ( )", ":* :*", "'; drop table items; --", "\\", "-", "or",
				"a".repeat(200), "<script>" }) {
			assertThat(get("/api/search?q=" + enc(query), userA).statusCode()).as(query).isEqualTo(200);
		}
	}

	@Test
	void aTitleMatchRanksAboveABodyMatch() throws Exception {
		note(userA, "Other", "alpha alpha alpha alpha");
		note(userA, "Alpha", "nothing here");

		assertThat(titles(search(userA, "alpha"))).containsExactly("Alpha", "Other");
	}

	@Test
	void filtersByTypeTagAndFolderCombineAndAFolderIncludesItsSubfolders() throws Exception {
		var work = folder(userA, "Work", null);
		var sub = folder(userA, "CoreEx", work);
		var other = folder(userA, "Other", null);
		var inSub = note(userA, "Doc in sub", "common", sub);
		var inWork = note(userA, "Doc in work", "common", work);
		var outside = note(userA, "Doc outside", "common", other);
		var asset = asset(userA, "common.png", "");
		var star = tag(userA, inSub, "star");
		tag(userA, outside, "star");
		tag(userA, asset, "star");

		assertThat(titles(searchWith(userA, "common", "&folderId=" + work))).containsExactlyInAnyOrder("Doc in sub",
				"Doc in work");
		assertThat(titles(searchWith(userA, "common", "&folderId=" + sub))).containsExactly("Doc in sub");
		assertThat(titles(searchWith(userA, "common", "&type=ASSET"))).containsExactly("common.png");
		assertThat(titles(searchWith(userA, "common", "&type=NOTE&tagId=" + star))).containsExactlyInAnyOrder("Doc in sub",
				"Doc outside");
		assertThat(titles(searchWith(userA, "common", "&tagId=" + star + "&folderId=" + work)))
				.containsExactly("Doc in sub");
		assertThat(searchWith(userA, "common", "&type=ASSET&folderId=" + work)).contains("\"total\":0");
		assertThat(inWork).isNotBlank();
	}

	@Test
	void aFolderOrTagThatIsMissingTrashedOrNotTheUsersIsNotFound() throws Exception {
		var trashed = folder(userA, "Gone", null);
		delete("/api/folders/" + trashed, userA);
		var theirsFolder = folder(userB, "Theirs", null);
		var theirsTag = tag(userB, note(userB, "B", "x"), "theirs");

		for (var more : new String[] { "&folderId=" + UUID.randomUUID(), "&folderId=" + trashed,
				"&folderId=" + theirsFolder, "&tagId=" + UUID.randomUUID(), "&tagId=" + theirsTag }) {
			assertThat(get("/api/search?q=x" + more, userA).statusCode()).as(more).isEqualTo(404);
		}
	}

	@Test
	void resultsShowHighlightedSnippetsAsPlainDataNeverMarkup() throws Exception {
		var body = "before words filler the <script>alert(1)</script> zebra stripes\u0002 and \u0003more";
		note(userA, "Zoo", body);
		note(userA, "Zebra title only", "nothing");

		var found = search(userA, "zebra");

		// The match is its own segment, flagged, with the text around it.
		assertThat(found).contains("{\"text\":\"zebra\",\"match\":true}");
		// Whatever markup the Note held is not in the snippet, and the API never adds any of its own.
		assertThat(found).contains("alert(1)").doesNotContain("<script>").doesNotContain("<mark>");
		assertThat(found).doesNotContain("\\u0002").doesNotContain("\\u0003");
		// A title-only match still gets a highlighted snippet (of the title).
		assertThat(found).contains("\"title\":\"Zebra title only\"");
		assertThat(found.split("\"match\":true", -1).length - 1).isGreaterThanOrEqualTo(2);
	}

	@Test
	void anAssetDescriptionAndATagNameAreHighlightedToo() throws Exception {
		asset(userA, "pic.png", "a photo of a heron");
		var tagged = note(userA, "Birds", "plain");
		tag(userA, tagged, "heron");

		var found = search(userA, "heron");

		assertThat(found).contains("{\"text\":\"heron\",\"match\":true}");
		assertThat(found.split("\"match\":true", -1).length - 1).isEqualTo(2);
	}

	@Test
	void resultsArePagedWithTheTotal() throws Exception {
		for (var n = 0; n < 5; n++) {
			note(userA, "Page " + n, "needle");
		}

		var first = searchWith(userA, "needle", "&size=2&page=0");
		var last = searchWith(userA, "needle", "&size=2&page=2");

		assertThat(titles(first)).hasSize(2);
		assertThat(first).contains("\"total\":5");
		assertThat(titles(last)).hasSize(1);
		assertThat(titles(searchWith(userA, "needle", "&size=2&page=3"))).isEmpty();
		// A page never holds more than 20 results, whatever size is asked for.
		for (var n = 5; n < 22; n++) {
			note(userA, "Page " + n, "needle");
		}
		var big = searchWith(userA, "needle", "&size=1000");
		assertThat(titles(big)).hasSize(20);
		assertThat(big).contains("\"total\":22");
	}

	@Test
	void aBlankQueryIsAnEmptyResultAndATooLongOneIsRefused() throws Exception {
		note(userA, "Note", "x");

		assertThat(get("/api/search", userA).body()).contains("\"total\":0");
		assertThat(search(userA, "   ")).contains("\"total\":0");
		assertThat(get("/api/search?q=" + enc("a".repeat(201)), userA).statusCode()).isEqualTo(400);
	}

	@Test
	void theQuickSwitcherMatchesTitlesByPrefixWordAndTypo() throws Exception {
		note(userA, "Research plan", "x");
		note(userA, "Resources", "x");
		note(userA, "Weekly planning", "x");
		note(userA, "Unrelated", "x");
		asset(userA, "research-notes.png", "");

		assertThat(quick(userA, "Res")).containsExactlyInAnyOrder("Research plan", "Resources", "research-notes.png");
		assertThat(quick(userA, "reserch")).contains("Research plan").doesNotContain("Unrelated", "Weekly planning");
		assertThat(quick(userA, "resarch plan")).contains("Research plan");
		assertThat(quick(userA, "plan")).contains("Research plan", "Weekly planning").doesNotContain("Unrelated");
		assertThat(quick(userA, "zzzzzz")).isEmpty();
		// Prefix matches come before fuzzy ones.
		assertThat(quick(userA, "Resea").get(0)).isIn("Research plan", "research-notes.png");
	}

	@Test
	void theQuickSwitcherKeepsOutTheTrashAndOtherUsersAndTreatsWildcardsAsText() throws Exception {
		var gone = note(userA, "Researching trash", "x");
		delete("/api/notes/" + gone, userA);
		note(userB, "Research of theirs", "x");
		note(userA, "a_b file", "x");
		note(userA, "axb file", "x");

		assertThat(quick(userA, "Research")).isEmpty();
		// "_" would match any character in a LIKE pattern; here it is just a character.
		assertThat(quick(userA, "a_b")).containsExactly("a_b file");
		assertThat(quick(userA, "%")).isEmpty();
		assertThat(quick(userA, "_")).isEmpty();
	}

	@Test
	void withNothingTypedTheQuickSwitcherListsRecentlyOpenedItemsThenRecentlyUpdatedOnes() throws Exception {
		var a = note(userA, "A", "x");
		var b = note(userA, "B", "x");
		note(userA, "C", "x");

		// Nothing opened yet: the most recently updated come first.
		assertThat(quick(userA, "")).containsExactly("C", "B", "A");

		assertThat(post("/api/items/" + b + "/open", userA, null).statusCode()).isEqualTo(204);
		clock.advance(Duration.ofMinutes(1));
		assertThat(post("/api/items/" + a + "/open", userA, null).statusCode()).isEqualTo(204);

		assertThat(quick(userA, "")).containsExactly("A", "B");
		clock.advance(Duration.ofMinutes(1));
		post("/api/items/" + b + "/open", userA, null);
		assertThat(quick(userA, "")).containsExactly("B", "A");
		// A trashed Item drops out of the recents.
		delete("/api/notes/" + b, userA);
		assertThat(quick(userA, "")).containsExactly("A");
	}

	@Test
	void anItemIsOpenedByItsOwnerAndOnlyWhileItIsLive() throws Exception {
		var mine = note(userA, "Mine", "x");
		var theirs = note(userB, "Theirs", "x");
		var gone = note(userA, "Gone", "x");
		delete("/api/notes/" + gone, userA);

		assertThat(post("/api/items/" + mine + "/open", userA, null).statusCode()).isEqualTo(204);
		assertThat(post("/api/items/" + theirs + "/open", userA, null).statusCode()).isEqualTo(404);
		assertThat(post("/api/items/" + gone + "/open", userA, null).statusCode()).isEqualTo(404);
		assertThat(post("/api/items/" + UUID.randomUUID() + "/open", userA, null).statusCode()).isEqualTo(404);
		assertThat(quick(userB, "")).containsExactly("Theirs");
		assertThat(post("/api/items/" + mine + "/open", null, null).statusCode()).isEqualTo(401);
	}

	@Test
	void searchNeedsASignedInUser() throws Exception {
		assertThat(get("/api/search?q=x").statusCode()).isEqualTo(401);
		assertThat(get("/api/search/quick?q=x").statusCode()).isEqualTo(401);
	}

}
