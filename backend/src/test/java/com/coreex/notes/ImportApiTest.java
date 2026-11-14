package com.coreex.notes;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
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

class ImportApiTest extends ApiTest {

	private record Upload(String filename, byte[] bytes) {
	}

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

	private static Upload text(String filename, String content) {
		return new Upload(filename, content.getBytes(StandardCharsets.UTF_8));
	}

	/** POSTs a multipart request like a browser form: an optional folderId field and any number of "files" parts. */
	private HttpResponse<String> importFiles(String token, String folderId, Upload... uploads) throws Exception {
		return send(token, "", folderId, uploads);
	}

	private HttpResponse<String> send(String token, String query, String folderId, Upload... uploads) throws Exception {
		var boundary = "----coreex" + UUID.randomUUID();
		var body = new ByteArrayOutputStream();
		if (folderId != null) {
			write(body, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"folderId\"\r\n\r\n" + folderId
					+ "\r\n");
		}
		for (var upload : uploads) {
			write(body, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"files\"; filename=\""
					+ upload.filename() + "\"\r\nContent-Type: application/octet-stream\r\n\r\n");
			body.write(upload.bytes());
			write(body, "\r\n");
		}
		write(body, "--" + boundary + "--\r\n");
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/notes/import" + query))
				.header("Content-Type", "multipart/form-data; boundary=" + boundary)
				.POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()));
		if (token != null) {
			request.header("Authorization", "Bearer " + token);
		}
		return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

	private static void write(ByteArrayOutputStream out, String text) throws IOException {
		out.write(text.getBytes(StandardCharsets.UTF_8));
	}

	private List<String> noteIds(String body) {
		var ids = new ArrayList<String>();
		var matcher = Pattern.compile("\"noteId\":\"([0-9a-f-]{36})\"").matcher(body);
		while (matcher.find()) {
			ids.add(matcher.group(1));
		}
		return ids;
	}

	private String storedBody(String id) {
		return jdbc.sql("select body from note_contents where item_id = :id").param("id", UUID.fromString(id))
				.query(String.class).single();
	}

	private String storedTitle(String id) {
		return jdbc.sql("select title from items where id = :id").param("id", UUID.fromString(id)).query(String.class)
				.single();
	}

	private String note(String token, String title) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\"}");
		assertThat(created.statusCode()).isEqualTo(201);
		return field(created.body(), "id");
	}

	@Test
	void importingTheSameFilesWithTheSameIdsTwiceMakesOneNotePerFile() throws Exception {
		var first = UUID.randomUUID();
		var second = UUID.randomUUID();
		var query = "?ids=" + first + "&ids=" + second;

		var once = send(userA, query, null, text("alpha.md", "# Alpha\n\none"), text("beta.md", "two"));
		var again = send(userA, query, null, text("alpha.md", "# Alpha changed\n\none"), text("beta.md", "other"));

		assertThat(once.statusCode()).isEqualTo(200);
		assertThat(again.statusCode()).isEqualTo(200);
		assertThat(noteIds(once.body())).containsExactly(first.toString(), second.toString());
		assertThat(noteIds(again.body())).containsExactly(first.toString(), second.toString());
		assertThat(again.body()).doesNotContain("REFUSED");
		assertThat(storedTitle(first.toString())).isEqualTo("alpha");
		assertThat(storedBody(second.toString())).isEqualTo("two");
		assertThat(jdbc.sql("select count(*) from items where type = 'NOTE'").query(Integer.class).single()).isEqualTo(2);
	}

	@Test
	void anIdOfAnotherUsersNoteRefusesOnlyThatFileOfAnImport() throws Exception {
		var taken = UUID.fromString(note(userB, "Bs"));
		var query = "?ids=" + taken + "&ids=" + UUID.randomUUID();

		var imported = send(userA, query, null, text("alpha.md", "a"), text("beta.md", "b"));

		assertThat(imported.statusCode()).isEqualTo(200);
		assertThat(imported.body()).contains("REFUSED").contains("INVALID_REQUEST").contains("IMPORTED");
		assertThat(noteIds(imported.body())).hasSize(1);
		assertThat(storedTitle(taken.toString())).isEqualTo("Bs");
	}

	@Test
	void aDifferentNumberOfIdsThanFilesIsRefusedAndNothingIsImported() throws Exception {
		var imported = send(userA, "?ids=" + UUID.randomUUID(), null, text("alpha.md", "a"), text("beta.md", "b"));

		assertThat(imported.statusCode()).isEqualTo(400);
		assertThat(imported.body()).contains("INVALID_REQUEST");
		assertThat(jdbc.sql("select count(*) from items").query(Integer.class).single()).isZero();
	}

	@Test
	void theSameIdForTwoFilesIsRefusedSoNoFileIsQuietlyDropped() throws Exception {
		var same = UUID.randomUUID();

		var imported = send(userA, "?ids=" + same + "&ids=" + same, null, text("alpha.md", "a"), text("beta.md", "b"));

		assertThat(imported.statusCode()).isEqualTo(400);
		assertThat(imported.body()).contains("INVALID_REQUEST");
		assertThat(jdbc.sql("select count(*) from items").query(Integer.class).single()).isZero();
	}

	@Test
	void severalFilesAreImportedInOneActionEachBecomingANote() throws Exception {
		var imported = importFiles(userA, null, text("alpha.md", "# Alpha\n\ntext"), text("beta.txt", "plain"),
				text("GAMMA.MD", "upper-case extension"));

		assertThat(imported.statusCode()).isEqualTo(200);
		var ids = noteIds(imported.body());
		assertThat(ids).hasSize(3);
		assertThat(imported.body()).contains("\"filename\":\"alpha.md\"").contains("\"filename\":\"beta.txt\"")
				.contains("\"filename\":\"GAMMA.MD\"");
		assertThat(imported.body().split("\"status\":\"IMPORTED\"", -1).length - 1).isEqualTo(3);
		assertThat(ids).extracting(this::storedTitle).containsExactly("alpha", "beta", "GAMMA");
		var items = get("/api/items", userA).body();
		assertThat(items).contains("\"total\":3");
		// They are ordinary Notes: readable and at version 1.
		assertThat(get("/api/notes/" + ids.get(0), userA).body()).contains("\"version\":1").contains("\"folderId\":null");
	}

	@Test
	void theTitleComesFromTheFilenameWithoutItsExtensionOrPath() throws Exception {
		var imported = importFiles(userA, null, text("My Notes.v2.md", "a"), text("some/dir/deep.md", "b"),
				text(".md", "c"), text("x".repeat(300) + ".txt", "d"));

		var titles = noteIds(imported.body()).stream().map(this::storedTitle).toList();

		assertThat(titles).containsExactly("My Notes.v2", "deep", "", "x".repeat(200));
	}

	@Test
	void theBodyIsStoredExactlyAsTheFileWroteItExceptForAByteOrderMark() throws Exception {
		var exact = "# Title  \r\n- [ ] task\t\n\n```java\r\nint x = 1;\r\n```\né中😀   \n";
		var withBom = new byte[] { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };
		var bomFile = new byte[withBom.length + 5];
		System.arraycopy(withBom, 0, bomFile, 0, 3);
		System.arraycopy("hello".getBytes(StandardCharsets.UTF_8), 0, bomFile, 3, 5);

		var imported = importFiles(userA, null, text("exact.md", exact), new Upload("bom.txt", bomFile),
				text("empty.md", ""));

		var ids = noteIds(imported.body());
		assertThat(ids).hasSize(3);
		assertThat(storedBody(ids.get(0))).isEqualTo(exact);
		assertThat(storedBody(ids.get(1))).isEqualTo("hello");
		assertThat(storedBody(ids.get(2))).isEmpty();
	}

	@Test
	void badFilesAreRefusedOneByOneWithoutFailingTheRestOfTheBatch() throws Exception {
		var tooBig = new byte[1_000_001];
		java.util.Arrays.fill(tooBig, (byte) 'a');
		var latin1 = new byte[] { 'c', 'a', 'f', (byte) 0xE9 };
		var withNul = "before\u0000after".getBytes(StandardCharsets.UTF_8);

		var imported = importFiles(userA, null, text("first.md", "one"), text("picture.png", "not text"),
				new Upload("big.md", tooBig), new Upload("latin1.txt", latin1), new Upload("nul.md", withNul),
				text("noextension", "x"), text("second.txt", "two"));

		assertThat(imported.statusCode()).isEqualTo(200);
		var results = imported.body();
		assertThat(noteIds(results)).hasSize(2);
		assertThat(results.split("\"status\":\"REFUSED\"", -1).length - 1).isEqualTo(5);
		assertThat(results).contains("\"code\":\"UNSUPPORTED_TYPE\"").contains("\"code\":\"FILE_TOO_LARGE\"")
				.contains("\"code\":\"NOT_UTF8\"");
		// Results keep the order of the files, each with its own message.
		assertThat(results.indexOf("first.md")).isLessThan(results.indexOf("picture.png"));
		assertThat(results.indexOf("picture.png")).isLessThan(results.indexOf("big.md"));
		assertThat(results.indexOf("big.md")).isLessThan(results.indexOf("latin1.txt"));
		assertThat(results.indexOf("latin1.txt")).isLessThan(results.indexOf("nul.md"));
		assertThat(results.indexOf("nul.md")).isLessThan(results.indexOf("noextension"));
		assertThat(results.indexOf("noextension")).isLessThan(results.indexOf("second.txt"));
		assertThat(get("/api/items", userA).body()).contains("\"total\":2").contains("first").contains("second");
		assertThat(results).contains("\"message\":\"");
	}

	@Test
	void aFileAtTheLimitIsAcceptedAndOnePastTheTransportCapFailsOnItsOwn() throws Exception {
		var atLimit = new byte[1_000_000];
		java.util.Arrays.fill(atLimit, (byte) 'a');
		assertThat(noteIds(importFiles(userA, null, new Upload("limit.md", atLimit)).body())).hasSize(1);

		var huge = new byte[2_500_000];
		java.util.Arrays.fill(huge, (byte) 'a');
		var refused = importFiles(userA, null, new Upload("huge.md", huge));

		assertThat(refused.statusCode()).isEqualTo(413);
		assertThat(refused.body()).contains("\"code\":\"FILE_TOO_LARGE\"");
	}

	@Test
	void notesAreImportedIntoTheChosenFolder() throws Exception {
		var folder = field(post("/api/folders", userA, "{\"name\":\"Inbox\"}").body(), "id");

		var imported = importFiles(userA, folder, text("one.md", "1"), text("two.md", "2"));

		assertThat(noteIds(imported.body())).hasSize(2);
		assertThat(get("/api/items?folderId=" + folder, userA).body()).contains("\"total\":2");
	}

	@Test
	void theFolderCanBeGivenInTheQueryStringLikeTheWebAppDoes() throws Exception {
		var folder = field(post("/api/folders", userA, "{\"name\":\"Inbox\"}").body(), "id");

		var imported = send(userA, "?folderId=" + folder, null, text("one.md", "1"));

		assertThat(noteIds(imported.body())).hasSize(1);
		assertThat(get("/api/items?folderId=" + folder, userA).body()).contains("\"total\":1");
	}

	@Test
	void aFolderThatIsMissingTrashedOrNotTheUsersFailsTheWholeRequestBeforeImportingAnything() throws Exception {
		var trashed = field(post("/api/folders", userA, "{\"name\":\"Gone\"}").body(), "id");
		delete("/api/folders/" + trashed, userA);
		var bsFolder = field(post("/api/folders", userB, "{\"name\":\"Bs\"}").body(), "id");

		for (var folder : new String[] { UUID.randomUUID().toString(), trashed, bsFolder }) {
			assertThat(importFiles(userA, folder, text("x.md", "x")).statusCode()).as(folder).isEqualTo(404);
		}
		assertThat(get("/api/items", userA).body()).contains("\"total\":0");
	}

	@Test
	void linksInImportedTextResolveUnderTheSameRulesAsEditing() throws Exception {
		var target = note(userA, "Target");
		note(userA, "Twin");
		note(userA, "Twin");

		var imported = importFiles(userA, null,
				text("source.md", "see [[Target]], [[Twin]], [[Nobody]] and `[[Target]]`\n```\n[[Target]]\n```"));

		var source = noteIds(imported.body()).get(0);
		assertThat(storedBody(source)).isEqualTo("see [[" + target + "|Target]], [[Twin]], [[Nobody]] and `[[Target]]`\n```\n[[Target]]\n```");
		assertThat(get("/api/items/" + target + "/backlinks", userA).body()).contains(source);
	}

	@Test
	void filesInTheSameBatchThatLinkToEachOtherAllResolve() throws Exception {
		var imported = importFiles(userA, null, text("one.md", "go to [[two]]"), text("two.md", "back to [[one]]"));

		var ids = noteIds(imported.body());
		var one = ids.get(0);
		var two = ids.get(1);
		assertThat(storedBody(one)).isEqualTo("go to [[" + two + "|two]]");
		assertThat(storedBody(two)).isEqualTo("back to [[" + one + "|one]]");
		assertThat(get("/api/items/" + two + "/backlinks", userA).body()).contains(one);
		assertThat(get("/api/items/" + one + "/backlinks", userA).body()).contains(two);
	}

	@Test
	void importedLinksNeverResolveToAnotherUsersItems() throws Exception {
		note(userB, "Secret");

		var imported = importFiles(userA, null, text("mine.md", "[[Secret]]"));

		assertThat(storedBody(noteIds(imported.body()).get(0))).isEqualTo("[[Secret]]");
	}

	@Test
	void importedNotesBelongToTheCallerOnly() throws Exception {
		var id = noteIds(importFiles(userA, null, text("private.md", "secret")).body()).get(0);

		assertThat(get("/api/notes/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/items", userB).body()).contains("\"total\":0");
		assertThat(get("/api/notes/" + id, userA).statusCode()).isEqualTo(200);
	}

	@Test
	void aRequestWithNoFilesOrTooManyFilesIsRefused() throws Exception {
		assertThat(importFiles(userA, null).statusCode()).isEqualTo(400);
		var many = new Upload[21];
		for (var n = 0; n < many.length; n++) {
			many[n] = text("f" + n + ".md", "x");
		}

		assertThat(importFiles(userA, null, many).statusCode()).isEqualTo(400);
		assertThat(get("/api/items", userA).body()).contains("\"total\":0");
	}

	@Test
	void importNeedsASignedInUser() throws Exception {
		assertThat(importFiles(null, null, text("x.md", "x")).statusCode()).isEqualTo(401);
	}

}
