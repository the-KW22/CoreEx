package com.coreex.embeddings;

import static org.assertj.core.api.Assertions.assertThat;

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

/** Notes are kept embedded: saved through the real API, embedded by the sweep, with the fake in place of the function. */
class NoteEmbeddingSweepTest extends ApiTest {

	private static final Duration SETTLED = Duration.ZERO;

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

	private static String json(String text) {
		return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
	}

	private static String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private UUID createNote(String token, String title, String body) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + json(title) + "\",\"body\":\"" + json(body) + "\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return UUID.fromString(field(created.body(), "id"));
	}

	private void saveNote(String token, UUID id, String title, String body) throws Exception {
		var current = get("/api/notes/" + id, token).body();
		var saved = put("/api/notes/" + id, token, "{\"title\":\"" + json(title) + "\",\"body\":\"" + json(body)
				+ "\",\"version\":" + field(current, "version") + "}");
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
	}

	private List<String> chunkTexts(UUID note) {
		return jdbc.sql("select content from note_chunks where note_id = :id order by position").param("id", note)
				.query(String.class).list();
	}

	private int chunkCount() {
		return jdbc.sql("select count(*) from note_chunks").query(Integer.class).single();
	}

	private String sections(String... names) {
		var body = new StringBuilder();
		for (var name : names) {
			body.append("# ").append(name).append("\ntext of ").append(name).append("\n\n");
		}
		return body.toString();
	}

	@Test
	void aSavedNoteGetsItsChunksOnceItHasSettledAndNotBefore() throws Exception {
		var note = createNote(userA, "Plan", "Buy milk");

		assertThat(sweep.run(Duration.ofHours(1))).as("still being edited").isZero();
		assertThat(chunkCount()).isZero();

		assertThat(sweep.run(SETTLED)).isEqualTo(1);
		assertThat(chunkTexts(note)).containsExactly("Plan\n\nBuy milk");
		var row = jdbc.sql("select model, vector_dims(embedding) as dims, position from note_chunks").query().singleRow();
		assertThat(row).containsEntry("model", "gte-small").containsEntry("dims", 384).containsEntry("position", 0);
		// The Note counts as embedded at the updated_at it was read at, so a later edit still makes it due.
		assertThat(jdbc.sql("""
				select c.embedded_updated_at = i.updated_at from items i join note_contents c on c.item_id = i.id
				where i.id = :id""").param("id", note).query(Boolean.class).single()).isTrue();
	}

	@Test
	void anUnchangedNoteIsNeverSentAgain() throws Exception {
		createNote(userA, "Plan", sections("A", "B"));
		sweep.run(SETTLED);
		var sent = embedder.sent().size();

		assertThat(sweep.run(SETTLED)).isZero();

		assertThat(embedder.sent()).hasSize(sent);
	}

	@Test
	void aParagraphAddedAtTheTopEmbedsOnlyItselfAndKeepsTheOthersInOrder() throws Exception {
		var note = createNote(userA, "Plan", sections("A", "B", "C"));
		sweep.run(SETTLED);
		embedder.clear();

		saveNote(userA, note, "Plan", sections("Z", "A", "B", "C"));
		assertThat(sweep.run(SETTLED)).isEqualTo(1);

		assertThat(embedder.sent()).containsExactly("Plan › Z\n\ntext of Z");
		assertThat(chunkTexts(note)).containsExactly("Plan › Z\n\ntext of Z", "Plan › A\n\ntext of A",
				"Plan › B\n\ntext of B", "Plan › C\n\ntext of C");
	}

	@Test
	void aRemovedSectionLosesItsChunkWithoutEmbeddingAnything() throws Exception {
		var note = createNote(userA, "Plan", sections("A", "B"));
		sweep.run(SETTLED);
		embedder.clear();

		saveNote(userA, note, "Plan", sections("A"));

		assertThat(sweep.run(SETTLED)).isZero();
		assertThat(chunkTexts(note)).containsExactly("Plan › A\n\ntext of A");
	}

	@Test
	void renamingANoteEmbedsItsChunksAgainBecauseTheTitleIsPartOfThem() throws Exception {
		var note = createNote(userA, "Plan", sections("A", "B"));
		sweep.run(SETTLED);
		embedder.clear();

		saveNote(userA, note, "Roadmap", sections("A", "B"));

		assertThat(sweep.run(SETTLED)).isEqualTo(2);
		assertThat(chunkTexts(note)).containsExactly("Roadmap › A\n\ntext of A", "Roadmap › B\n\ntext of B");
	}

	@Test
	void chunksOfAnotherModelAreEmbeddedAgain() throws Exception {
		var note = createNote(userA, "Plan", sections("A", "B"));
		sweep.run(SETTLED);
		jdbc.sql("update note_chunks set model = 'old-model'").update();

		assertThat(sweep.run(SETTLED)).isEqualTo(2);

		assertThat(jdbc.sql("select distinct model from note_chunks").query(String.class).list())
				.containsExactly("gte-small");
		assertThat(chunkTexts(note)).hasSize(2);
	}

	@Test
	void eachRunEmbedsAtMostTheCeilingAndTheRestFollowsOnTheNextRuns() throws Exception {
		var names = new String[120];
		for (var i = 0; i < names.length; i++) {
			names[i] = "S" + i;
		}
		var note = createNote(userA, "Big", sections(names));

		assertThat(sweep.run(SETTLED)).isEqualTo(50);
		assertThat(chunkCount()).isEqualTo(50);
		assertThat(embeddedMarker(note)).as("not finished yet").isFalse();
		assertThat(sweep.run(SETTLED)).isEqualTo(50);
		assertThat(sweep.run(SETTLED)).isEqualTo(20);

		assertThat(chunkCount()).isEqualTo(120);
		assertThat(embeddedMarker(note)).isTrue();
		assertThat(chunkTexts(note).get(119)).isEqualTo("Big › S119\n\ntext of S119");
		assertThat(sweep.run(SETTLED)).isZero();
		assertThat(embedder.sent()).hasSize(120);
	}

	@Test
	void anUnavailableEmbedderStoresNothingAndTheNextRunCatchesUp() throws Exception {
		var note = createNote(userA, "Plan", sections("A"));
		embedder.setDown(true);

		assertThat(sweep.run(SETTLED)).isZero();
		assertThat(chunkCount()).isZero();
		assertThat(embeddedMarker(note)).isFalse();

		embedder.setDown(false);
		assertThat(sweep.run(SETTLED)).isEqualTo(1);
		assertThat(chunkTexts(note)).hasSize(1);
	}

	@Test
	void aNoteInTheTrashIsNotEmbeddedAndAnEmbeddedOneKeepsItsChunksForARestore() throws Exception {
		var embeddedFirst = createNote(userA, "Kept", sections("A"));
		sweep.run(SETTLED);
		var trashedFirst = createNote(userA, "Trashed", sections("A"));
		assertThat(delete("/api/notes/" + trashedFirst, userA).statusCode()).isEqualTo(204);
		assertThat(delete("/api/notes/" + embeddedFirst, userA).statusCode()).isEqualTo(204);

		assertThat(sweep.run(SETTLED)).isZero();

		assertThat(chunkTexts(trashedFirst)).isEmpty();
		assertThat(chunkTexts(embeddedFirst)).hasSize(1);
	}

	@Test
	void removingANoteForGoodRemovesItsChunks() throws Exception {
		var note = createNote(userA, "Plan", sections("A", "B"));
		sweep.run(SETTLED);
		assertThat(chunkCount()).isEqualTo(2);

		jdbc.sql("delete from items where id = :id").param("id", note).update();

		assertThat(chunkCount()).isZero();
	}

	@Test
	void everyChunkBelongsToTheUserWhoOwnsItsNote() throws Exception {
		createNote(userA, "A's", sections("X", "Y"));
		createNote(userB, "B's", sections("X"));

		sweep.run(SETTLED);

		assertThat(jdbc.sql("select count(*) from note_chunks k join items i on i.id = k.note_id where k.owner_id <> i.owner_id")
				.query(Integer.class).single()).isZero();
		assertThat(jdbc.sql("select count(*) from note_chunks k join users u on u.id = k.owner_id where u.email = 'b@example.com'")
				.query(Integer.class).single()).isEqualTo(1);
	}

	@Test
	void aBlankNoteHasNoChunksButIsNotPickedUpAgain() throws Exception {
		var note = createNote(userA, "", "");

		assertThat(sweep.run(SETTLED)).isZero();

		assertThat(embeddedMarker(note)).isTrue();
		assertThat(chunkCount()).isZero();
	}

	@Test
	void theChunkTableIsClosedByRowLevelSecurity() {
		var secured = jdbc.sql("""
				select relrowsecurity from pg_class
				where relname = 'note_chunks' and relnamespace = 'coreex'::regnamespace""").query(Boolean.class).single();

		assertThat(secured).isTrue();
	}

	private boolean embeddedMarker(UUID note) {
		return jdbc.sql("select embedded_updated_at is not null from note_contents where item_id = :id").param("id", note)
				.query(Boolean.class).single();
	}

}
