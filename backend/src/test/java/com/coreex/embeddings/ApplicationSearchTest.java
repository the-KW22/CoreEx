package com.coreex.embeddings;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestEmbedder;
import com.coreex.TestJwts;

/**
 * An Application is in the knowledge graph: found by Search (words and meaning), linked to from a Note, a node in the
 * Graph. What it is found by is its plain text: company, role, location, posting and the notes on its timeline.
 */
class ApplicationSearchTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestEmbedder embedder;

	@Autowired
	NoteEmbeddingSweep sweep;

	private String userA;

	private String userB;

	@BeforeEach
	void clean() {
		jdbc.sql("delete from users").update();
		embedder.clear();
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

	private String application(String token, String company, String role, String posting) throws Exception {
		var created = post("/api/applications", token,
				"{\"company\":\"" + company + "\",\"role\":\"" + role + "\",\"postingText\":\"" + posting + "\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private String found(String token, String query, String extra) throws Exception {
		var response = get("/api/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8) + extra, token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	@Test
	void searchFindsAnApplicationByItsPostingItsNotesAndItsCompanyAndNeverForAnotherUser() throws Exception {
		var id = application(userA, "Acme", "Engineer", "We need a zebra wrangler who loves spreadsheets");
		var note = post("/api/applications/" + id + "/timeline", userA,
				"{\"type\":\"NOTE\",\"text\":\"Spoke with Priyanka about pay\",\"version\":1}");
		assertThat(note.statusCode()).as(note.body()).isEqualTo(201);

		for (var word : List.of("zebra", "Priyanka", "Acme", "spreadsheets")) {
			var body = found(userA, word, "");
			assertThat(body).as(word).contains("\"id\":\"" + id + "\"").contains("\"type\":\"APPLICATION\"");
		}
		// The match is shown in its place: the posting's words are marked in the snippet.
		assertThat(found(userA, "zebra", "")).contains("zebra");
		assertThat(found(userA, "zebra", "&type=APPLICATION")).contains("\"id\":\"" + id + "\"");
		assertThat(found(userA, "zebra", "&type=NOTE")).doesNotContain(id);
		assertThat(found(userB, "zebra", "")).doesNotContain(id);
	}

	@Test
	void anApplicationInTheTrashIsNotFoundAndComesBackWhenRestored() throws Exception {
		var id = application(userA, "Acme", "Engineer", "A zebra wrangler wanted");

		assertThat(delete("/api/applications/" + id, userA).statusCode()).isEqualTo(204);
		assertThat(found(userA, "zebra", "")).doesNotContain(id);

		post("/api/trash/items/" + id + "/restore", userA, null);
		assertThat(found(userA, "zebra", "")).contains("\"id\":\"" + id + "\"");
	}

	@Test
	void aNoteLinksToAnApplicationWhichShowsItBackAndTheGraphHasItAsANode() throws Exception {
		var id = application(userA, "Acme", "Engineer", "");
		var note = post("/api/notes", userA, "{\"title\":\"Plan\",\"body\":\"Call back about [[Engineer at Acme]] soon\"}");
		assertThat(note.statusCode()).as(note.body()).isEqualTo(201);
		var noteId = field(note.body(), "id");

		var backlinks = get("/api/items/" + id + "/backlinks", userA);
		assertThat(backlinks.statusCode()).as(backlinks.body()).isEqualTo(200);
		assertThat(backlinks.body()).contains("\"id\":\"" + noteId + "\"");

		var graph = get("/api/links/graph", userA).body();
		assertThat(graph).contains("\"id\":\"" + id + "\"").contains("\"type\":\"APPLICATION\"");
		assertThat(get("/api/items/" + id + "/backlinks", userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/links/graph", userB).body()).doesNotContain(id);
	}

	@Test
	void theSweepEmbedsAnApplicationsPlainTextAndMeaningFindsItWithoutAMatchingWord() throws Exception {
		var id = application(userA, "Acme", "Engineer", "We need a zebra wrangler");
		post("/api/applications/" + id + "/timeline", userA, "{\"type\":\"NOTE\",\"text\":\"Pay was discussed\",\"version\":1}");

		sweep.run(Duration.ZERO);

		var chunks = jdbc.sql("select content from note_chunks where note_id = :id order by position")
				.param("id", UUID.fromString(id)).query(String.class).list();
		assertThat(String.join("\n", chunks)).contains("Engineer at Acme").contains("zebra wrangler")
				.contains("Pay was discussed");
		// A second run leaves it alone: nothing changed.
		embedder.clear();
		assertThat(sweep.run(Duration.ZERO)).isZero();

		// Meaning only: a Chunk with other words is what the query is closest to.
		jdbc.sql("delete from note_chunks where note_id = :id").param("id", UUID.fromString(id)).update();
		var vector = embedder.embed(List.of("car repair")).orElseThrow().get(0);
		jdbc.sql("""
				insert into note_chunks (owner_id, note_id, position, content, content_hash, model, embedding)
				select i.owner_id, i.id, 0, 'car repair', 'x', 'gte-small', cast(:vector as halfvec)
				from items i where i.id = :id""").param("vector", Embedder.literal(vector)).param("id", UUID.fromString(id))
				.update();
		assertThat(found(userA, "car repair", "")).contains("\"id\":\"" + id + "\"");
		assertThat(found(userB, "car repair", "")).doesNotContain(id);
	}

}
