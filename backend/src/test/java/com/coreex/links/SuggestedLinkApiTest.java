package com.coreex.links;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class SuggestedLinkApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	private String userA;

	private String userB;

	private UUID ownerB;

	private UUID ownerA;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		ownerA = UUID.randomUUID();
		ownerB = UUID.randomUUID();
		userA = userToken(ownerA, "a@example.com");
		userB = userToken(ownerB, "b@example.com");
	}

	private String userToken(UUID id, String email) {
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	private String note(String token, String title, String body) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\",\"body\":\"" + body + "\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		var matcher = Pattern.compile("\"id\":\"([^\"]*)").matcher(created.body());
		assertThat(matcher.find()).isTrue();
		return matcher.group(1);
	}

	/** Gives a Note one Chunk pointing this way: Notes with near directions are close in meaning. */
	private void embed(UUID owner, String noteId, double x, double y) {
		var numbers = new String[384];
		Arrays.fill(numbers, "0");
		numbers[0] = String.valueOf(x);
		numbers[1] = String.valueOf(y);
		jdbc.sql("""
				insert into note_chunks (owner_id, note_id, position, content, content_hash, model, embedding)
				values (:owner, :note, 0, 'text', 'hash', 'test', cast(:vector as halfvec))""").param("owner", owner)
				.param("note", UUID.fromString(noteId)).param("vector", "[" + String.join(",", numbers) + "]").update();
	}

	private String suggestions(String token) throws Exception {
		var response = get("/api/links/graph/suggestions", token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	private String body(String id) {
		return jdbc.sql("select body from note_contents where item_id = :id").param("id", UUID.fromString(id))
				.query(String.class).single();
	}

	@Test
	void closeNotesAreSuggestedOnceAndFarOnesAreNot() throws Exception {
		var cars = note(userA, "Cars", "");
		var automobiles = note(userA, "Automobiles", "");
		var soup = note(userA, "Soup", "");
		embed(ownerA, cars, 1, 0.02);
		embed(ownerA, automobiles, 1, 0.03);
		embed(ownerA, soup, 0, 1);

		var body = suggestions(userA);

		assertThat(body).contains(cars, automobiles).doesNotContain(soup);
		assertThat(body.split("similarity", -1)).hasSize(2);
	}

	@Test
	void aPairAlreadyLinkedIsNoSuggestionInEitherDirection() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "[[" + target + "|T]]");
		embed(ownerA, target, 1, 0);
		embed(ownerA, source, 1, 0);

		assertThat(suggestions(userA)).contains("\"items\":[]");
	}

	@Test
	void withoutEmbeddingsThereIsNothingAndNoError() throws Exception {
		note(userA, "Plain", "");

		assertThat(suggestions(userA)).contains("\"items\":[]");
	}

	@Test
	void trashedNotesAndOtherUsersNotesAreNeverSuggested() throws Exception {
		var mine = note(userA, "Mine", "");
		var trashed = note(userA, "Trashed", "");
		var theirs = note(userB, "Theirs", "");
		embed(ownerA, mine, 1, 0);
		embed(ownerA, trashed, 1, 0);
		embed(ownerB, theirs, 1, 0);
		delete("/api/notes/" + trashed, userA);

		assertThat(suggestions(userA)).doesNotContain(trashed).doesNotContain(theirs).contains("\"items\":[]");
		assertThat(suggestions(userB)).doesNotContain(mine);
	}

	@Test
	void aSuggestionNeverBecomesALinkOrABacklinkByItself() throws Exception {
		var one = note(userA, "One", "");
		var two = note(userA, "Two", "");
		embed(ownerA, one, 1, 0);
		embed(ownerA, two, 1, 0);

		assertThat(suggestions(userA)).contains(one);

		assertThat(get("/api/items/" + one + "/backlinks", userA).body()).contains("\"total\":0");
		assertThat(get("/api/links/graph", userA).body()).contains("\"edges\":[]");
	}

	@Test
	void anotherUsersFolderHasNoSuggestions() throws Exception {
		var created = post("/api/folders", userB, "{\"name\":\"Theirs\"}");
		var matcher = Pattern.compile("\"id\":\"([^\"]*)").matcher(created.body());
		assertThat(matcher.find()).isTrue();

		assertThat(get("/api/links/graph/suggestions?folderId=" + matcher.group(1), userA).statusCode()).isEqualTo(404);
	}

	private int linkIt(String token, String target, String noteId) throws Exception {
		return post("/api/items/" + target + "/suggested-links/" + noteId, token, "").statusCode();
	}

	@Test
	void linkItAddsALinkAtTheEndWhenTheNoteHasNoMention() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "Some text");

		assertThat(linkIt(userA, target, source)).isEqualTo(204);

		assertThat(body(source)).isEqualTo("Some text\n\n[[" + target + "|Target]]");
		assertThat(get("/api/items/" + target + "/backlinks", userA).body()).contains(source);
	}

	@Test
	void linkItWrapsAMentionWhenThereIsOneAndAnEmptyNoteGetsJustTheLink() throws Exception {
		var target = note(userA, "Target", "");
		var mentioning = note(userA, "Mentioning", "A target here");
		var empty = note(userA, "Empty", "");

		assertThat(linkIt(userA, target, mentioning)).isEqualTo(204);
		assertThat(linkIt(userA, target, empty)).isEqualTo(204);

		assertThat(body(mentioning)).isEqualTo("A [[" + target + "|target]] here");
		assertThat(body(empty)).isEqualTo("[[" + target + "|Target]]");
	}

	@Test
	void linkItTwiceAddsOneLink() throws Exception {
		var target = note(userA, "Target", "");
		var source = note(userA, "Source", "");

		assertThat(linkIt(userA, target, source)).isEqualTo(204);
		assertThat(linkIt(userA, target, source)).isEqualTo(204);

		assertThat(body(source)).isEqualTo("[[" + target + "|Target]]");
	}

	@Test
	void linkItIsNotFoundForAnotherUsersItemsAndForItself() throws Exception {
		var mine = note(userA, "Mine", "");
		var theirs = note(userB, "Theirs", "");

		assertThat(linkIt(userA, theirs, mine)).isEqualTo(404);
		assertThat(linkIt(userA, mine, theirs)).isEqualTo(404);
		assertThat(linkIt(userA, mine, mine)).isEqualTo(404);
		assertThat(body(theirs)).isEmpty();
	}

}
