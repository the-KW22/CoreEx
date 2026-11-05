package com.coreex.notes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class MentionApiTest extends ApiTest {

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

	private String note(String token, String title, String body) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\",\"body\":\"" + body + "\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		var matcher = Pattern.compile("\"id\":\"([^\"]*)").matcher(created.body());
		assertThat(matcher.find()).isTrue();
		return matcher.group(1);
	}

	private String mentions(String token, String id) throws Exception {
		var response = get("/api/items/" + id + "/mentions", token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	private int link(String token, String id, String noteId, int version) throws Exception {
		return post("/api/items/" + id + "/mentions/" + noteId + "/link", token, "{\"version\":" + version + "}").statusCode();
	}

	private int version(String id) {
		return jdbc.sql("select version from note_contents where item_id = :id").param("id", UUID.fromString(id))
				.query(Integer.class).single();
	}

	private String body(String id) {
		return jdbc.sql("select body from note_contents where item_id = :id").param("id", UUID.fromString(id))
				.query(String.class).single();
	}

	@Test
	void listsNotesWithTheTitleAndASnippet() throws Exception {
		var item = note(userA, "Energy", "");
		var mentioning = note(userA, "Physics", "Kinetic energy is motion");
		note(userA, "Unrelated", "Nothing about it");

		var body = mentions(userA, item);

		assertThat(body).contains(mentioning, "\"total\":1", "\"before\":\"Kinetic \"", "\"match\":\"energy\"",
				"\"after\":\" is motion\"", "\"version\":" + version(mentioning));
		assertThat(body).doesNotContain("Unrelated");
	}

	@Test
	void leavesOutTheItemItselfNotesAlreadyLinkingAndTrashedNotes() throws Exception {
		var item = note(userA, "Energy", "Energy is its own subject");
		var linking = note(userA, "Linking", "See [[Energy]] and energy again");
		var trashed = note(userA, "Trashed", "energy");
		delete("/api/notes/" + trashed, userA);

		assertThat(mentions(userA, item)).contains("\"total\":0").doesNotContain(linking);
	}

	@Test
	void aMentionInCodeOrAVeryShortTitleListsNothing() throws Exception {
		var item = note(userA, "Energy", "");
		note(userA, "Code", "`energy` only");
		var shortTitle = note(userA, "AI", "");
		note(userA, "Short", "ai is everywhere");

		assertThat(mentions(userA, item)).contains("\"total\":0");
		assertThat(mentions(userA, shortTitle)).contains("\"total\":0");
	}

	@Test
	void linkItWrapsTheFirstMentionKeepsTheWordsAndMakesABacklink() throws Exception {
		var item = note(userA, "Energy", "");
		var mentioning = note(userA, "Physics", "`energy` then ENERGY and energy");

		assertThat(link(userA, item, mentioning, version(mentioning))).isEqualTo(204);

		assertThat(body(mentioning)).isEqualTo("`energy` then [[" + item + "|ENERGY]] and energy");
		assertThat(get("/api/items/" + item + "/backlinks", userA).body()).contains(mentioning);
		assertThat(mentions(userA, item)).contains("\"total\":0");
	}

	@Test
	void linkItWithAStaleVersionIsAConflictAndChangesNothing() throws Exception {
		var item = note(userA, "Energy", "");
		var mentioning = note(userA, "Physics", "energy");
		var seen = version(mentioning);
		put("/api/notes/" + mentioning, userA, "{\"title\":\"Physics\",\"body\":\"energy now\",\"version\":" + seen + "}");

		assertThat(link(userA, item, mentioning, seen)).isEqualTo(409);

		assertThat(body(mentioning)).isEqualTo("energy now");
	}

	@Test
	void linkItWhenTheMentionIsGoneIsNotFound() throws Exception {
		var item = note(userA, "Energy", "");
		var other = note(userA, "Other", "nothing here");

		assertThat(link(userA, item, other, version(other))).isEqualTo(404);
		assertThat(link(userA, item, item, version(item))).isEqualTo(404);
	}

	@Test
	void anotherUsersItemsAndNotesAreNotFoundAndNeverListed() throws Exception {
		var item = note(userA, "Energy", "");
		var theirs = note(userB, "Their physics", "energy");
		var mine = note(userA, "Mine", "energy");
		var theirItem = note(userB, "Energy", "");

		assertThat(mentions(userA, item)).contains(mine).doesNotContain(theirs);
		assertThat(get("/api/items/" + theirItem + "/mentions", userA).statusCode()).isEqualTo(404);
		assertThat(link(userA, theirItem, mine, version(mine))).isEqualTo(404);
		assertThat(link(userA, item, theirs, version(theirs))).isEqualTo(404);
		assertThat(body(theirs)).isEqualTo("energy");
	}

	@Test
	void aPageSizeOutsideTheLimitsIsClampedAndTheCountStaysTrue() throws Exception {
		var item = note(userA, "Energy", "");
		note(userA, "One", "energy");
		note(userA, "Two", "energy");

		var body = get("/api/items/" + item + "/mentions?size=0", userA).body();

		assertThat(body).contains("\"total\":2");
		assertThat(body.split("\"match\":", -1)).hasSize(2);
		assertThat(get("/api/items/" + item + "/mentions?size=51", userA).statusCode()).isEqualTo(200);
	}

}
