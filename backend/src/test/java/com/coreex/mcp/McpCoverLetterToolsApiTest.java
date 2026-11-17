package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** create_resume and the Cover Letter tools: an Agent can start and write both, scoped to the User. */
class McpCoverLetterToolsApiTest extends McpApiTest {

	private JsonNode restLetter(String id) throws Exception {
		return JSON.readTree(get("/api/cover-letters/" + id, jwt).body());
	}

	private String letter(String title) throws Exception {
		return call("create_cover_letter", "{\"title\":\"" + title + "\"}").path("id").asString();
	}

	@Test
	void theNewToolsAreListed() throws Exception {
		var names = new ArrayList<String>();
		rpc(token, "tools/list", "{}").path("result").path("tools").forEach(t -> names.add(t.path("name").asString()));

		assertThat(names).contains("create_resume", "list_cover_letters", "get_cover_letter", "create_cover_letter",
				"edit_cover_letter");
	}

	@Test
	void createResumeMakesABlankOneAndARetryWithTheSameIdMakesNoSecond() throws Exception {
		var id = UUID.randomUUID().toString();

		var first = call("create_resume", "{\"title\":\"Backend CV\",\"id\":\"" + id + "\"}");
		var again = call("create_resume", "{\"title\":\"Backend CV\",\"id\":\"" + id + "\"}");

		assertThat(first.path("id").asString()).isEqualTo(id);
		assertThat(first.path("version").asInt()).isEqualTo(1);
		assertThat(again.path("id").asString()).isEqualTo(id);
		assertThat(call("list_resumes", "{}").path("total").asInt()).isEqualTo(1);
		assertThat(call("get_resume", "{\"id\":\"" + id + "\"}").path("title").asString()).isEqualTo("Backend CV");
	}

	@Test
	void aCreatedResumeCanBeFilledWithPatchResume() throws Exception {
		var id = call("create_resume", "{\"title\":\"CV\"}").path("id").asString();

		call("patch_resume", "{\"id\":\"" + id + "\",\"version\":1,\"operations\":"
				+ "[{\"op\":\"replace\",\"path\":\"/basics/name\",\"value\":\"Ada Lovelace\"}]}");

		assertThat(call("get_resume", "{\"id\":\"" + id + "\"}").path("markdown").asString()).contains("Ada Lovelace");
	}

	@Test
	void createListAndReadACoverLetter() throws Exception {
		var id = letter("For Acme");

		var listed = call("list_cover_letters", "{}");
		assertThat(listed.path("coverLetters")).hasSize(1);
		assertThat(listed.path("coverLetters").get(0).path("id").asString()).isEqualTo(id);

		var view = call("get_cover_letter", "{\"id\":\"" + id + "\"}");
		assertThat(view.path("title").asString()).isEqualTo("For Acme");
		assertThat(view.path("version").asInt()).isEqualTo(1);
		assertThat(view.path("document").path("body").asString()).isEmpty();
	}

	@Test
	void aLetterLinkedToAResumeTakesItsSender() throws Exception {
		var resume = id(post("/api/resumes", jwt, "{\"sample\":true}").body());

		var id = call("create_cover_letter", "{\"title\":\"L\",\"resumeId\":\"" + resume + "\"}").path("id").asString();

		assertThat(call("get_cover_letter", "{\"id\":\"" + id + "\"}").path("document").path("sender").path("name")
				.asString()).isEqualTo("Alex Morgan");
	}

	@Test
	void editSetsOnlyTheGivenFieldsKeepsAVersionAndMarksTheAgent() throws Exception {
		var id = letter("L");

		var saved = call("edit_cover_letter", "{\"id\":\"" + id + "\",\"version\":1,\"greeting\":\"Dear Team,\","
				+ "\"body\":\"<p>I would love to join.</p><script>alert(1)</script>\"}");
		assertThat(saved.path("version").asInt()).isEqualTo(2);
		call("edit_cover_letter", "{\"id\":\"" + id + "\",\"version\":2,\"signOff\":\"Regards\"}");

		var document = restLetter(id).path("document");
		assertThat(document.path("greeting").asString()).isEqualTo("Dear Team,");
		assertThat(document.path("body").asString()).contains("I would love to join.").doesNotContain("script");
		assertThat(document.path("signOff").asString()).isEqualTo("Regards");
		var versions = get("/api/cover-letters/" + id + "/versions", jwt).body();
		assertThat(JSON.readTree(versions)).isNotEmpty();
		assertThat(jdbc.sql("select edited_by from items where id = :id::uuid").param("id", id).query(String.class).single())
				.isNotBlank();
	}

	@Test
	void aStaleVersionIsRefusedAndNothingChanges() throws Exception {
		var id = letter("L");
		call("edit_cover_letter", "{\"id\":\"" + id + "\",\"version\":1,\"greeting\":\"Hi\"}");

		var error = callFails("edit_cover_letter", "{\"id\":\"" + id + "\",\"version\":1,\"greeting\":\"Yo\"}");

		assertThat(error).contains("changed somewhere else");
		assertThat(restLetter(id).path("document").path("greeting").asString()).isEqualTo("Hi");
	}

	@Test
	void anotherUsersResumeAndLetterAreNotFound() throws Exception {
		var otherJwt = newUser("b@example.com");
		var otherResume = id(post("/api/resumes", otherJwt, "{\"sample\":true}").body());
		var otherLetter = id(post("/api/cover-letters", otherJwt, "{\"title\":\"Theirs\"}").body());

		assertThat(callFails("create_cover_letter", "{\"title\":\"L\",\"resumeId\":\"" + otherResume + "\"}")).isNotBlank();
		assertThat(callFails("get_cover_letter", "{\"id\":\"" + otherLetter + "\"}")).isNotBlank();
		assertThat(callFails("edit_cover_letter", "{\"id\":\"" + otherLetter + "\",\"version\":1,\"body\":\"x\"}")).isNotBlank();
		assertThat(call("list_cover_letters", "{}").path("coverLetters")).isEmpty();
	}

	@Test
	void editWithNothingToChangeIsRefused() throws Exception {
		var id = letter("L");

		assertThat(callFails("edit_cover_letter", "{\"id\":\"" + id + "\",\"version\":1}")).contains("Give at least one");
	}

	@Test
	void createWithTheSameIdTwiceMakesOneLetterAndAnotherUsersIdIsRefused() throws Exception {
		var id = UUID.randomUUID().toString();
		call("create_cover_letter", "{\"title\":\"L\",\"id\":\"" + id + "\"}");
		var again = call("create_cover_letter", "{\"title\":\"L\",\"id\":\"" + id + "\"}");

		assertThat(again.path("id").asString()).isEqualTo(id);
		assertThat(call("list_cover_letters", "{}").path("coverLetters")).hasSize(1);

		var theirs = id(post("/api/cover-letters", newUser("c@example.com"), "{\"title\":\"Theirs\"}").body());
		assertThat(callFails("create_cover_letter", "{\"title\":\"L\",\"id\":\"" + theirs + "\"}")).isNotBlank();
	}

	@Test
	void aTooLongBodyIsRefusedAndALinkedLetterKeepsItsSender() throws Exception {
		var resume = id(post("/api/resumes", jwt, "{\"sample\":true}").body());
		var id = call("create_cover_letter", "{\"title\":\"L\",\"resumeId\":\"" + resume + "\"}").path("id").asString();

		assertThat(callFails("edit_cover_letter", "{\"id\":\"" + id + "\",\"version\":1,\"body\":\"" + "x".repeat(200001) + "\"}"))
				.contains("too long");
		call("edit_cover_letter", "{\"id\":\"" + id + "\",\"version\":1,\"greeting\":\"Hi\"}");

		assertThat(restLetter(id).path("document").path("sender").path("name").asString()).isEqualTo("Alex Morgan");
	}

}
