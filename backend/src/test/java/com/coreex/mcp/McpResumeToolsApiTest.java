package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The Resume tools: read, edit with JSON Patch, and the generic Item tools on a Resume. Results are checked through REST too. */
class McpResumeToolsApiTest extends McpApiTest {

	private String resume(String userJwt) throws Exception {
		return id(post("/api/resumes", userJwt, "{\"sample\":true}").body());
	}

	private String resume() throws Exception {
		return resume(jwt);
	}

	private JsonNode restResume(String id) throws Exception {
		return JSON.readTree(get("/api/resumes/" + id, jwt).body());
	}

	private static String ops(String... operations) {
		return "[" + String.join(",", operations) + "]";
	}

	private static String setName(String name) {
		return "{\"op\":\"replace\",\"path\":\"/basics/name\",\"value\":\"" + name + "\"}";
	}

	private JsonNode patch(String id, int version, String operations) throws Exception {
		return call("patch_resume", "{\"id\":\"" + id + "\",\"version\":" + version + ",\"operations\":" + operations + "}");
	}

	private String patchFails(String id, int version, String operations) throws Exception {
		return callFails("patch_resume", "{\"id\":\"" + id + "\",\"version\":" + version + ",\"operations\":" + operations + "}");
	}

	@Test
	void theResumeToolsAreListedAndNothingDeletesForGood() throws Exception {
		var names = new ArrayList<String>();
		rpc(token, "tools/list", "{}").path("result").path("tools").forEach(t -> names.add(t.path("name").asString()));

		assertThat(names).contains("list_resumes", "get_resume", "patch_resume");
		assertThat(names).noneMatch(n -> n.matches(".*(delete|empty|import|admin|purge).*"));
	}

	@Test
	void listResumesPagesTheUsersResumesAndGetResumeGivesMarkdownJsonAndTheCounter() throws Exception {
		var id = resume();
		resume();

		var listed = call("list_resumes", "{}");
		assertThat(listed.path("total").asInt()).isEqualTo(2);
		assertThat(listed.path("resumes")).hasSize(2);
		assertThat(listed.path("nextPage").isMissingNode() || listed.path("nextPage").isNull()).isTrue();

		var view = call("get_resume", "{\"id\":\"" + id + "\"}");
		assertThat(view.path("version").asInt()).isEqualTo(1);
		assertThat(view.path("markdown").asString()).contains("Alex Morgan");
		assertThat(view.path("document").path("basics").path("name").asString()).isEqualTo("Alex Morgan");
	}

	@Test
	void aValidPatchAppliesKeepsAVersionAndMarksTheAgentsEdit() throws Exception {
		var id = resume();

		var first = patch(id, 1, ops(setName("Ada Lovelace")));
		assertThat(first.path("version").asInt()).isEqualTo(2);
		assertThat(restResume(id).path("document").path("basics").path("name").asString()).isEqualTo("Ada Lovelace");

		patch(id, 2, ops("{\"op\":\"replace\",\"path\":\"/basics/headline\",\"value\":\"Engineer\"}"));
		assertThat(restResume(id).path("version").asInt()).isEqualTo(3);
		var versions = JSON.readTree(get("/api/resumes/" + id + "/versions", jwt).body()).toString();
		assertThat(versions).contains("\"editedBy\":\"agent\"");
	}

	@Test
	void aStaleCounterIsRefusedAndNothingChanges() throws Exception {
		var id = resume();
		patch(id, 1, ops(setName("Ada Lovelace")));

		var error = patchFails(id, 1, ops(setName("Grace Hopper")));

		assertThat(error).contains("changed somewhere else");
		assertThat(restResume(id).path("document").path("basics").path("name").asString()).isEqualTo("Ada Lovelace");
		assertThat(restResume(id).path("version").asInt()).isEqualTo(2);
	}

	@Test
	void aResultThatDoesNotDeserialiseIsRefusedAndNothingChanges() throws Exception {
		var id = resume();
		var before = restResume(id).path("document").toString();

		var error = patchFails(id, 1, ops(
				"{\"op\":\"add\",\"path\":\"/sections/-\",\"value\":{\"id\":\"x\",\"kind\":\"NOPE\",\"title\":\"T\",\"entries\":[]}}"));

		assertThat(error).isNotBlank();
		assertThat(restResume(id).path("version").asInt()).isEqualTo(1);
		assertThat(restResume(id).path("document").toString()).isEqualTo(before);
	}

	@Test
	void aPatchThatIsNotValidOrReachesOutsideTheDocumentChangesNothing() throws Exception {
		var id = resume();
		var before = restResume(id).path("document").toString();

		for (var bad : new String[] {
				"{\"op\":\"test\",\"path\":\"/basics/name\",\"value\":\"Nobody\"}",
				"{\"op\":\"replace\",\"path\":\"/version\",\"value\":99}",
				"{\"op\":\"add\",\"path\":\"/owner\",\"value\":\"x\"}",
				"{\"op\":\"replace\",\"path\":\"/id\",\"value\":\"x\"}",
				"{\"op\":\"move\",\"from\":\"/summary\",\"path\":\"/privateNotes\"}",
				"{\"op\":\"remove\",\"path\":\"/sections/99\"}",
				"{\"op\":\"replace\",\"path\":\"/basics/nosuchfield\",\"value\":\"x\"}",
				"{\"op\":\"replace\",\"path\":\"basics/name\",\"value\":\"x\"}" }) {
			assertThat(patchFails(id, 1, ops(bad))).as(bad).isNotBlank();
		}
		assertThat(restResume(id).path("version").asInt()).isEqualTo(1);
		assertThat(restResume(id).path("document").toString()).isEqualTo(before);
	}

	@Test
	void aPatchIsCappedAndNeedsAtLeastOneOperation() throws Exception {
		var id = resume();
		var many = new ArrayList<String>();
		for (int i = 0; i < 101; i++) {
			many.add("{\"op\":\"test\",\"path\":\"/basics/name\",\"value\":\"Alex Morgan\"}");
		}

		assertThat(patchFails(id, 1, ops(many.toArray(String[]::new)))).contains("at most 100");
		assertThat(patchFails(id, 1, "[]")).contains("at least one");
		assertThat(restResume(id).path("version").asInt()).isEqualTo(1);
	}

	@Test
	void htmlAddedByAPatchIsSanitisedBeforeItIsSaved() throws Exception {
		var id = resume();

		patch(id, 1, ops("{\"op\":\"replace\",\"path\":\"/summary\",\"value\":\"<p>Hi</p><img src=x onerror=\\\"alert(1)\\\"><script>alert(2)</script>\"}"));

		var stored = restResume(id).path("document").path("summary").asString();
		assertThat(stored).contains("Hi").doesNotContain("onerror").doesNotContain("<script").doesNotContain("<img");
		assertThat(call("get_resume", "{\"id\":\"" + id + "\"}").path("document").path("summary").asString())
				.doesNotContain("onerror").doesNotContain("<script");
	}

	@Test
	void aLockedResumeRefusesAPatch() throws Exception {
		var id = resume();
		put("/api/resumes/" + id + "/lock", jwt, "{\"locked\":true}");

		var error = patchFails(id, 1, ops(setName("Ada Lovelace")));

		assertThat(error).containsIgnoringCase("locked");
		assertThat(restResume(id).path("version").asInt()).isEqualTo(1);
	}

	@Test
	void anotherUsersResumeIsNotFoundForAnyTool() throws Exception {
		var other = newUser("b@example.com");
		var theirs = resume(other);

		for (var tool : new String[][] {
				{ "get_resume", "{\"id\":\"" + theirs + "\"}" },
				{ "patch_resume", "{\"id\":\"" + theirs + "\",\"version\":1,\"operations\":[" + setName("Mine") + "]}" },
				{ "get_item", "{\"id\":\"" + theirs + "\"}" },
				{ "move_item", "{\"id\":\"" + theirs + "\"}" },
				{ "set_tags", "{\"id\":\"" + theirs + "\",\"tags\":[\"x\"]}" },
				{ "trash_item", "{\"id\":\"" + theirs + "\"}" },
				{ "restore", "{\"id\":\"" + theirs + "\"}" } }) {
			assertThat(callFails(tool[0], tool[1])).as(tool[0]).containsIgnoringCase("no such");
		}
		assertThat(call("list_resumes", "{}").path("total").asInt()).isZero();
		var stored = JSON.readTree(get("/api/resumes/" + theirs, other).body());
		assertThat(stored.path("version").asInt()).isEqualTo(1);
		assertThat(stored.path("document").path("basics").path("name").asString()).isEqualTo("Alex Morgan");
	}

	@Test
	void theGenericItemToolsAcceptAResume() throws Exception {
		var id = resume();
		var folder = folder("CVs");
		patch(id, 1, ops("{\"op\":\"replace\",\"path\":\"/summary\",\"value\":\"<p>Runs Kubernetes platforms</p>\"}"));

		var item = call("get_item", "{\"id\":\"" + id + "\"}");
		assertThat(item.path("type").asString()).isEqualTo("RESUME");
		assertThat(item.path("markdown").asString()).contains("Kubernetes");
		assertThat(item.path("version").asInt()).isEqualTo(2);

		call("move_item", "{\"id\":\"" + id + "\",\"folderId\":\"" + folder + "\"}");
		assertThat(restResume(id).path("folderId").asString()).isEqualTo(folder);
		call("set_tags", "{\"id\":\"" + id + "\",\"tags\":[\"cv\"]}");
		assertThat(get("/api/items/" + id + "/tags", jwt).body()).contains("cv");

		var hits = call("search", "{\"query\":\"Kubernetes\",\"type\":\"RESUME\"}").path("hits");
		assertThat(hits.get(0).path("id").asString()).isEqualTo(id);
		assertThat(hits.get(0).path("type").asString()).isEqualTo("RESUME");

		call("trash_item", "{\"id\":\"" + id + "\"}");
		assertThat(get("/api/resumes/" + id, jwt).statusCode()).isEqualTo(404);
		assertThat(call("list_trash", "{}").toString()).contains(id);
		call("restore", "{\"id\":\"" + id + "\"}");
		assertThat(get("/api/resumes/" + id, jwt).statusCode()).isEqualTo(200);
		assertThat(call("get_resume", "{\"id\":\"" + id + "\"}").path("version").asInt()).isEqualTo(2);
	}

}
