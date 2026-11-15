package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class ApplicationBulkApiTest extends ApiTest {

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

	private static String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"?([^\",}]*)").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private String made(String token, String company) throws Exception {
		var created = post("/api/applications", token, "{\"company\":\"" + company + "\",\"role\":\"Engineer\"}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private static String ids(String... ids) {
		return "[\"" + String.join("\",\"", ids) + "\"]";
	}

	@Test
	void aBulkMoveWritesATimelineEntryOnEachAndClosingTakesOneReasonForAll() throws Exception {
		var one = made(userA, "One");
		var two = made(userA, "Two");

		var moved = post("/api/applications/bulk/stage", userA, "{\"ids\":" + ids(one, two) + ",\"stage\":\"APPLIED\"}");
		assertThat(moved.statusCode()).as(moved.body()).isEqualTo(200);
		assertThat(moved.body()).contains(one).contains(two).contains("\"failed\":[]");
		for (var id : new String[] { one, two }) {
			var body = get("/api/applications/" + id, userA).body();
			assertThat(field(body, "stage")).isEqualTo("APPLIED");
			assertThat(body.split("\"type\":\"STAGE\"", -1)).hasSize(3); // Saved, then Applied
		}

		var noReason = post("/api/applications/bulk/stage", userA, "{\"ids\":" + ids(one, two) + ",\"stage\":\"CLOSED\"}");
		assertThat(noReason.statusCode()).isEqualTo(400);
		assertThat(get("/api/applications/" + one, userA).body()).contains("\"stage\":\"APPLIED\"");

		var closed = post("/api/applications/bulk/stage", userA,
				"{\"ids\":" + ids(one, two) + ",\"stage\":\"CLOSED\",\"closeReason\":\"WITHDREW\"}");
		assertThat(closed.statusCode()).as(closed.body()).isEqualTo(200);
		assertThat(get("/api/applications/" + two, userA).body()).contains("\"closeReason\":\"WITHDREW\"");
	}

	@Test
	void anotherUsersOrUnknownIdsFailAsNotFoundWithoutAnyDifferenceAndTheRestStillWork() throws Exception {
		var mine = made(userA, "Mine");
		var theirs = made(userB, "Theirs");
		var nobodys = UUID.randomUUID().toString();

		var moved = post("/api/applications/bulk/stage", userA,
				"{\"ids\":" + ids(mine, theirs, nobodys) + ",\"stage\":\"APPLIED\"}");

		assertThat(moved.statusCode()).as(moved.body()).isEqualTo(200);
		assertThat(moved.body()).contains("\"done\":[\"" + mine + "\"]")
				.contains("{\"id\":\"" + theirs + "\",\"code\":\"NOT_FOUND\"}")
				.contains("{\"id\":\"" + nobodys + "\",\"code\":\"NOT_FOUND\"}");
		assertThat(get("/api/applications/" + theirs, userB).body()).contains("\"stage\":\"SAVED\"");

		for (var path : new String[] { "trash", "tags/add" }) {
			var body = "trash".equals(path) ? "{\"ids\":" + ids(theirs) + "}" : "{\"ids\":" + ids(theirs) + ",\"name\":\"x\"}";
			var refused = post("/api/applications/bulk/" + path, userA, body);
			assertThat(refused.body()).contains("\"done\":[]").contains("\"code\":\"NOT_FOUND\"");
		}
		assertThat(get("/api/applications/" + theirs, userB).statusCode()).isEqualTo(200);
	}

	@Test
	void aBulkTagIsAddedAndRemovedOnEachAndAnotherUsersTagIsRefused() throws Exception {
		var one = made(userA, "One");
		var two = made(userA, "Two");

		var added = post("/api/applications/bulk/tags/add", userA, "{\"ids\":" + ids(one, two) + ",\"name\":\" Hot \"}");
		assertThat(added.statusCode()).as(added.body()).isEqualTo(200);
		assertThat(added.body()).contains("\"failed\":[]");
		var tagged = get("/api/items/" + one + "/tags", userA).body();
		assertThat(tagged).contains("\"name\":\"Hot\"");
		var tagId = field(tagged, "id");
		assertThat(get("/api/items/" + two + "/tags", userA).body()).contains("\"name\":\"Hot\"");

		var removed = post("/api/applications/bulk/tags/remove", userA, "{\"ids\":" + ids(one, two) + ",\"tagId\":\"" + tagId + "\"}");
		assertThat(removed.statusCode()).as(removed.body()).isEqualTo(200);
		assertThat(get("/api/items/" + one + "/tags", userA).body()).contains("\"total\":0");

		assertThat(post("/api/applications/bulk/tags/remove", userB, "{\"ids\":" + ids(made(userB, "B")) + ",\"tagId\":\"" + tagId + "\"}")
				.statusCode()).isEqualTo(404);
		assertThat(post("/api/applications/bulk/tags/add", userA, "{\"ids\":" + ids(one) + ",\"name\":\" \"}").statusCode())
				.isEqualTo(400);
	}

	@Test
	void aBulkTrashHidesThemAndRestoreBringsEachBackWithItsTimelineUnchanged() throws Exception {
		var one = made(userA, "One");
		var two = made(userA, "Two");
		var before = get("/api/applications/" + one, userA).body();

		var trashed = post("/api/applications/bulk/trash", userA, "{\"ids\":" + ids(one, two, one) + "}");
		assertThat(trashed.statusCode()).as(trashed.body()).isEqualTo(200);
		assertThat(trashed.body().split(one, -1)).hasSize(2); // listed once although sent twice
		assertThat(get("/api/applications/" + one, userA).statusCode()).isEqualTo(404);
		assertThat(get("/api/applications", userA).body()).contains("\"total\":0");

		// Already in the Trash: that one fails, the others are untouched.
		var again = post("/api/applications/bulk/trash", userA, "{\"ids\":" + ids(one) + "}");
		assertThat(again.body()).contains("\"done\":[]").contains("NOT_FOUND");

		var restored = post("/api/trash/items/" + one + "/restore", userA, "{}");
		assertThat(restored.statusCode()).as(restored.body()).isIn(200, 204);
		var after = get("/api/applications/" + one, userA);
		assertThat(after.statusCode()).isEqualTo(200);
		assertThat(field(after.body(), "version")).isEqualTo(field(before, "version"));
		assertThat(after.body()).contains(before.substring(before.indexOf("\"timeline\""), before.indexOf("\"version\"")));
	}

}
