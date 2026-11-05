package com.coreex.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestEmbedder;
import com.coreex.TestJwts;
import com.coreex.embeddings.Embedder;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Search finds Notes by meaning as well as by words. The fake Embedder turns words into numbers, so two texts are close
 * exactly when they share words: a Chunk is stored by hand with the words a query should reach, and the Note itself
 * says something else, which is what "found by meaning only" looks like here.
 */
class SemanticSearchTest extends ApiTest {

	private final JsonMapper json = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestEmbedder embedder;

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

	private UUID note(String token, String title, String body) throws Exception {
		return note(token, title, body, null);
	}

	private UUID note(String token, String title, String body, UUID folderId) throws Exception {
		var folder = folderId == null ? "null" : "\"" + folderId + "\"";
		var created = post("/api/notes", token,
				"{\"title\":\"" + title + "\",\"body\":\"" + body + "\",\"folderId\":" + folder + "}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return UUID.fromString(json.readTree(created.body()).path("id").asString());
	}

	private UUID folder(String token, String name) throws Exception {
		var created = post("/api/folders", token, "{\"name\":\"" + name + "\",\"parentId\":null}");
		assertThat(created.statusCode()).isEqualTo(201);
		return UUID.fromString(json.readTree(created.body()).path("id").asString());
	}

	/** Stores a Chunk for the Note, embedded the way the sweep would, with the text it should be found by. */
	private void chunk(UUID note, String content) {
		var vector = embedder.embed(List.of(content)).orElseThrow().get(0);
		jdbc.sql("""
				insert into note_chunks (owner_id, note_id, position, content, content_hash, model, embedding)
				select i.owner_id, i.id, coalesce((select max(position) + 1 from note_chunks where note_id = i.id), 0),
				       :content, :hash, 'gte-small', cast(:vector as halfvec)
				from items i where i.id = :note""").param("content", content).param("hash", UUID.randomUUID().toString())
				.param("vector", Embedder.literal(vector)).param("note", note).update();
	}

	private JsonNode search(String token, String query, String extra) throws Exception {
		var response = get("/api/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8) + extra, token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return json.readTree(response.body());
	}

	private JsonNode search(String token, String query) throws Exception {
		return search(token, query, "");
	}

	private static List<String> titles(JsonNode result) {
		var titles = new ArrayList<String>();
		result.path("items").forEach(hit -> titles.add(hit.path("title").asString()));
		return titles;
	}

	private static String snippet(JsonNode hit) {
		var text = new StringBuilder();
		hit.path("snippet").forEach(part -> text.append(part.path("text").asString()));
		return text.toString();
	}

	@Test
	void aNoteThatSharesNoWordWithTheQueryIsFoundByItsChunk() throws Exception {
		var note = note(userA, "Garage", "Oil changes and tyre pressure");
		chunk(note, "car repair");

		var result = search(userA, "car repair");

		assertThat(titles(result)).containsExactly("Garage");
		assertThat(result.path("total").asInt()).isEqualTo(1);
		assertThat(result.path("exactOnly").asBoolean()).isFalse();
	}

	@Test
	void aMeaningOnlyHitShowsTheStartOfItsChunkWithoutTheTitleLine() throws Exception {
		var note = note(userA, "Garage", "Oil changes");
		chunk(note, "Garage › Prices\n\ncar repair costs a lot");

		// The same words as the Chunk, so the fake sees them as identical.
		var hit = search(userA, "garage prices car repair costs a lot").path("items").get(0);

		assertThat(snippet(hit)).isEqualTo("car repair costs a lot");
		assertThat(hit.path("snippet").get(0).path("match").asBoolean()).isFalse();
	}

	@Test
	void aNoteInBothListsComesFirstAndEachNoteAppearsOnce() throws Exception {
		var both = note(userA, "car repair guide", "How to fix a car");
		chunk(both, "car repair");
		chunk(both, "car repair");
		note(userA, "car repair manual", "only the exact words match here");
		var meaning = note(userA, "Garage", "Oil changes");
		chunk(meaning, "car repair");

		var result = search(userA, "car repair");

		assertThat(titles(result)).hasSize(3).first().isEqualTo("car repair guide");
		assertThat(titles(result)).containsExactlyInAnyOrder("car repair guide", "car repair manual", "Garage");
		assertThat(result.path("total").asInt()).isEqualTo(3);
	}

	@Test
	void anExactWordMatchStillShowsItsHighlightedSnippetAndRanks() throws Exception {
		note(userA, "Plan", "the quarterly budget is due");

		var result = search(userA, "budget");

		assertThat(titles(result)).containsExactly("Plan");
		assertThat(result.path("items").get(0).path("snippet").toString()).contains("\"match\":true");
	}

	@Test
	void aWeakMatchIsDroppedAndNothingElseIsAdded() throws Exception {
		var note = note(userA, "Garage", "Oil changes");
		chunk(note, "boats sails rope anchor harbour");

		var result = search(userA, "car repair");

		assertThat(titles(result)).isEmpty();
		assertThat(result.path("total").asInt()).isZero();
		assertThat(result.path("exactOnly").asBoolean()).isFalse();
	}

	@Test
	void aChunkOnlyPartlyAboutTheQueryIsKeptOrDroppedByTheMinimumSimilarity() throws Exception {
		var close = note(userA, "Close", "Oil");
		var far = note(userA, "Far", "Oil");
		chunk(close, "car repair costs"); // 2 of 3 words in common with the query: about 0.82
		chunk(far, "car repair costs today"); // 2 of 4: about 0.71, under the default 0.79

		assertThat(titles(search(userA, "car repair"))).containsExactly("Close");
	}

	@Test
	void anotherUsersChunksAndChunksOfNotesInTheTrashNeverAppear() throws Exception {
		var theirs = note(userB, "Garage", "Oil changes");
		chunk(theirs, "car repair");
		var trashed = note(userA, "Old garage", "Oil changes");
		chunk(trashed, "car repair");
		assertThat(delete("/api/notes/" + trashed, userA).statusCode()).isEqualTo(204);

		assertThat(titles(search(userA, "car repair"))).isEmpty();
		assertThat(titles(search(userB, "car repair"))).containsExactly("Garage");
	}

	@Test
	void theFoldersAndTypeFiltersApplyToMeaningMatchesToo() throws Exception {
		var work = folder(userA, "Work");
		var inside = note(userA, "Inside", "Oil", work);
		var outside = note(userA, "Outside", "Oil");
		chunk(inside, "car repair");
		chunk(outside, "car repair");

		assertThat(titles(search(userA, "car repair", "&folderId=" + work))).containsExactly("Inside");
		assertThat(titles(search(userA, "car repair", "&type=NOTE"))).containsExactlyInAnyOrder("Inside", "Outside");
		var assets = search(userA, "car repair", "&type=ASSET");
		assertThat(titles(assets)).isEmpty();
		assertThat(assets.path("exactOnly").asBoolean()).as("not asking for Notes is not a failure").isFalse();
	}

	@Test
	void withoutEmbeddingsSearchIsTheExactListAndSaysSo() throws Exception {
		var note = note(userA, "Garage", "the car repair bill");
		chunk(note, "car repair");
		note(userA, "Other", "nothing here");
		embedder.setDown(true);

		var result = search(userA, "car repair");

		assertThat(titles(result)).containsExactly("Garage");
		assertThat(result.path("exactOnly").asBoolean()).isTrue();
	}

	@Test
	void aNoteWithoutChunksYetIsStillFoundByItsWords() throws Exception {
		note(userA, "Fresh", "just written about budgets");

		var result = search(userA, "budgets");

		assertThat(titles(result)).containsExactly("Fresh");
		assertThat(result.path("exactOnly").asBoolean()).isFalse();
	}

	@Test
	void pagesAreSlicesOfTheMergedList() throws Exception {
		for (var i = 0; i < 3; i++) {
			chunk(note(userA, "Note " + i, "Oil " + i), "car repair");
		}

		var first = search(userA, "car repair", "&size=2&page=0");
		var second = search(userA, "car repair", "&size=2&page=1");

		assertThat(first.path("total").asInt()).isEqualTo(3);
		assertThat(titles(first)).hasSize(2);
		assertThat(titles(second)).hasSize(1);
		assertThat(titles(first)).doesNotContainAnyElementsOf(titles(second));
	}

}
