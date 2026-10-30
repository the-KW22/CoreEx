package com.coreex.tags;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class TagApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@MockitoSpyBean
	TagRepository tagRepository;

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

	private String note(String token, String title) throws Exception {
		var created = post("/api/notes", token, "{\"title\":\"" + title + "\"}");
		assertThat(created.statusCode()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private HttpResponse<String> tag(String token, String itemId, String name) throws Exception {
		return post("/api/items/" + itemId + "/tags", token, "{\"name\":\"" + name + "\"}");
	}

	/** Adds the Tag to the Item and returns the Tag's id. */
	private String tagId(String token, String itemId, String name) throws Exception {
		var added = tag(token, itemId, name);
		assertThat(added.statusCode()).as(added.body()).isEqualTo(200);
		return field(added.body(), "id");
	}

	@Test
	void aTagIsAddedByNameAndShownOnTheItem() throws Exception {
		var item = note(userA, "N");

		var added = tag(userA, item, "  Research ");

		assertThat(added.statusCode()).isEqualTo(200);
		assertThat(added.body()).contains("\"name\":\"Research\"");
		var onItem = get("/api/items/" + item + "/tags", userA);
		assertThat(onItem.statusCode()).isEqualTo(200);
		assertThat(onItem.body()).contains("\"total\":1").contains("\"name\":\"Research\"");
	}

	@Test
	void researchAndResearchAreTheSameTag() throws Exception {
		var first = note(userA, "First");
		var second = note(userA, "Second");

		var a = tagId(userA, first, "Research");
		var b = tagId(userA, second, "research");
		var again = tagId(userA, first, "RESEARCH");

		assertThat(b).isEqualTo(a);
		assertThat(again).isEqualTo(a);
		var list = get("/api/tags", userA).body();
		// One Tag, with the casing it was first typed in, used by two Items (adding it twice changed nothing).
		assertThat(list).contains("\"total\":1").contains("\"name\":\"Research\"").contains("\"itemCount\":2");
		assertThat(get("/api/items/" + first + "/tags", userA).body()).contains("\"total\":1");
	}

	@Test
	void removingATagFromAnItemKeepsTheTag() throws Exception {
		var item = note(userA, "N");
		var tagId = tagId(userA, item, "Ideas");

		assertThat(delete("/api/items/" + item + "/tags/" + tagId, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/items/" + item + "/tags", userA).body()).contains("\"total\":0");
		assertThat(get("/api/tags", userA).body()).contains("Ideas").contains("\"itemCount\":0");
		// Removing it again is harmless.
		assertThat(delete("/api/items/" + item + "/tags/" + tagId, userA).statusCode()).isEqualTo(204);
	}

	@Test
	void countsAndTagPagesShowLiveItemsOnly() throws Exception {
		var kept = note(userA, "Kept");
		var gone = note(userA, "Gone");
		var tagId = tagId(userA, kept, "Work");
		tagId(userA, gone, "work");
		var untagged = note(userA, "Untagged");

		assertThat(get("/api/tags", userA).body()).contains("\"itemCount\":2");
		assertThat(delete("/api/notes/" + gone, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/tags", userA).body()).contains("\"itemCount\":1");
		var page = get("/api/items?tagId=" + tagId, userA).body();
		assertThat(page).contains("\"total\":1").contains(kept).doesNotContain(gone).doesNotContain(untagged);
	}

	@Test
	void theTagFilterCombinesWithTheFolderFilter() throws Exception {
		var folder = field(post("/api/folders", userA, "{\"name\":\"F\"}").body(), "id");
		var inFolder = field(post("/api/notes", userA, "{\"folderId\":\"" + folder + "\"}").body(), "id");
		var outside = note(userA, "Outside");
		var tagId = tagId(userA, inFolder, "t");
		tagId(userA, outside, "t");

		var both = get("/api/items?tagId=" + tagId + "&folderId=" + folder, userA).body();

		assertThat(both).contains("\"total\":1").contains(inFolder).doesNotContain(outside);
	}

	@Test
	void renamingATagChangesItEverywhere() throws Exception {
		var item = note(userA, "N");
		var tagId = tagId(userA, item, "Draft");

		var renamed = put("/api/tags/" + tagId, userA, "{\"name\":\"Final\"}");

		assertThat(renamed.statusCode()).isEqualTo(200);
		assertThat(renamed.body()).contains("\"name\":\"Final\"");
		assertThat(get("/api/items/" + item + "/tags", userA).body()).contains("Final").doesNotContain("Draft");
		// Only the casing of the same Tag changes: allowed.
		assertThat(put("/api/tags/" + tagId, userA, "{\"name\":\"FINAL\"}").statusCode()).isEqualTo(200);
	}

	@Test
	void renamingToANameTheUserAlreadyHasIsRefused() throws Exception {
		var item = note(userA, "N");
		var a = tagId(userA, item, "Alpha");
		tagId(userA, item, "Beta");

		var refused = put("/api/tags/" + a, userA, "{\"name\":\"beta\"}");

		assertThat(refused.statusCode()).isEqualTo(409);
		assertThat(refused.body()).contains("\"code\":\"TAG_EXISTS\"");
		assertThat(get("/api/tags", userA).body()).contains("\"total\":2").contains("Alpha").contains("Beta");
	}

	@Test
	void deletingATagRemovesItFromEveryItemAndKeepsTheItems() throws Exception {
		var one = note(userA, "One");
		var two = note(userA, "Two");
		var tagId = tagId(userA, one, "Temp");
		tagId(userA, two, "Temp");
		tagId(userA, two, "Other");

		assertThat(delete("/api/tags/" + tagId, userA).statusCode()).isEqualTo(204);

		assertThat(get("/api/tags", userA).body()).contains("\"total\":1").doesNotContain("Temp");
		assertThat(get("/api/items/" + two + "/tags", userA).body()).contains("Other").doesNotContain("Temp");
		assertThat(get("/api/items", userA).body()).contains("\"total\":2");
		assertThat(get("/api/notes/" + one, userA).statusCode()).isEqualTo(200);
		assertThat(delete("/api/tags/" + tagId, userA).statusCode()).isEqualTo(404);
	}

	@Test
	void userBGets404ForUserAsTagsAndItems() throws Exception {
		var item = note(userA, "Private");
		var aTag = tagId(userA, item, "research");
		var bItem = note(userB, "Mine");

		assertThat(put("/api/tags/" + aTag, userB, "{\"name\":\"x\"}").statusCode()).isEqualTo(404);
		assertThat(delete("/api/tags/" + aTag, userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/items?tagId=" + aTag, userB).statusCode()).isEqualTo(404);
		assertThat(tag(userB, item, "x").statusCode()).isEqualTo(404);
		assertThat(get("/api/items/" + item + "/tags", userB).statusCode()).isEqualTo(404);
		assertThat(delete("/api/items/" + item + "/tags/" + aTag, userB).statusCode()).isEqualTo(404);
		// Removing A's Tag id from B's own Item must not touch A's link either.
		assertThat(delete("/api/items/" + bItem + "/tags/" + aTag, userB).statusCode()).isEqualTo(404);
		assertThat(get("/api/tags", userB).body()).contains("\"total\":0");
		// B's own "research" is a different Tag.
		var bTag = tagId(userB, bItem, "Research");
		assertThat(bTag).isNotEqualTo(aTag);
		assertThat(get("/api/tags", userA).body()).contains("\"total\":1").contains("\"itemCount\":1");
		assertThat(get("/api/items/" + item + "/tags", userA).body()).contains("research");
	}

	@Test
	void aTagHasNoColourUntilOneIsSetAndItShowsEverywhere() throws Exception {
		var item = note(userA, "N");
		var tagId = tagId(userA, item, "Draft");
		assertThat(get("/api/tags", userA).body()).contains("\"colour\":null");

		var set = put("/api/tags/" + tagId + "/colour", userA, "{\"colour\":\"teal\"}");

		assertThat(set.statusCode()).as(set.body()).isEqualTo(200);
		assertThat(set.body()).contains("\"colour\":\"teal\"");
		assertThat(get("/api/tags", userA).body()).contains("\"colour\":\"teal\"");
		assertThat(get("/api/items/" + item + "/tags", userA).body()).contains("\"colour\":\"teal\"");
		// Renaming keeps the colour; null goes back to automatic.
		assertThat(put("/api/tags/" + tagId, userA, "{\"name\":\"Final\"}").body()).contains("\"colour\":\"teal\"");
		assertThat(put("/api/tags/" + tagId + "/colour", userA, "{\"colour\":null}").body())
				.contains("\"colour\":null");
	}

	@Test
	void anUnknownColourGets400AndAnotherUsersTagGets404() throws Exception {
		var item = note(userA, "N");
		var tagId = tagId(userA, item, "Draft");

		assertThat(put("/api/tags/" + tagId + "/colour", userA, "{\"colour\":\"magenta\"}").statusCode())
				.isEqualTo(400);
		assertThat(put("/api/tags/" + tagId + "/colour", userA, "{\"colour\":\"Teal\"}").statusCode())
				.isEqualTo(400);
		assertThat(put("/api/tags/" + tagId + "/colour", userB, "{\"colour\":\"teal\"}").statusCode())
				.isEqualTo(404);
		assertThat(get("/api/tags", userA).body()).contains("\"colour\":null");
	}

	@Test
	void aDeletedItemCannotBeTagged() throws Exception {
		var item = note(userA, "N");
		delete("/api/notes/" + item, userA);

		assertThat(tag(userA, item, "x").statusCode()).isEqualTo(404);
		assertThat(get("/api/items/" + item + "/tags", userA).statusCode()).isEqualTo(404);
	}

	@Test
	void invalidNamesGet400() throws Exception {
		var item = note(userA, "N");
		var tagId = tagId(userA, item, "ok");

		assertThat(tag(userA, item, "   ").statusCode()).isEqualTo(400);
		assertThat(tag(userA, item, "x".repeat(51)).statusCode()).isEqualTo(400);
		assertThat(post("/api/items/" + item + "/tags", userA, "{\"name\":\"a\\u0000b\"}").statusCode())
				.isEqualTo(400);
		assertThat(put("/api/tags/" + tagId, userA, "{\"name\":\"\"}").statusCode()).isEqualTo(400);
	}

	@Test
	void tagsNeedASignedInUser() throws Exception {
		assertThat(get("/api/tags").statusCode()).isEqualTo(401);
	}

	@Test
	void aTagDeletedWhileItIsBeingAddedIsCreatedAgainNotA500() throws Exception {
		var item = note(userA, "N");
		var first = tagId(userA, item, "Research");
		// The Tag is deleted in the moment between "find or create" and "link".
		doAnswer(call -> {
			var tag = call.callRealMethod();
			jdbc.sql("delete from tags where id = :id").param("id", UUID.fromString(first)).update();
			return tag;
		}).doCallRealMethod().when(tagRepository).findOrCreate(any(), any());

		var added = tag(userA, item, "Research");

		assertThat(added.statusCode()).as(added.body()).isEqualTo(200);
		assertThat(field(added.body(), "id")).isNotEqualTo(first);
		assertThat(get("/api/items/" + item + "/tags", userA).body()).contains("\"total\":1");
	}

}
