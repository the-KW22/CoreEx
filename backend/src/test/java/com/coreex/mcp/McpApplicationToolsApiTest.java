package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The Application tools, and the generic Item tools on an Application. Results are checked through REST too. */
class McpApplicationToolsApiTest extends McpApiTest {

	private JsonNode restApplication(String id) throws Exception {
		return JSON.readTree(get("/api/applications/" + id, jwt).body());
	}

	private String create(String company, String role) throws Exception {
		return call("create_application", "{\"company\":\"" + company + "\",\"role\":\"" + role + "\"}").path("id").asString();
	}

	@Test
	void theApplicationToolsAreListedAndNothingDeletesForGood() throws Exception {
		var names = new ArrayList<String>();
		rpc(token, "tools/list", "{}").path("result").path("tools").forEach(t -> names.add(t.path("name").asString()));

		assertThat(names).contains("create_application", "get_application", "list_applications", "update_application",
				"move_application_stage", "add_application_note");
		assertThat(names).noneMatch(n -> n.matches(".*(delete|empty|import|admin|purge).*"));
	}

	@Test
	void createApplicationMakesOneInSavedAndARetryWithTheSameIdReturnsIt() throws Exception {
		var id = UUID.randomUUID().toString();
		var args = "{\"id\":\"" + id + "\",\"company\":\"Acme\",\"role\":\"Engineer\",\"postingText\":\"We hire\"}";

		var first = call("create_application", args);
		var again = call("create_application", args.replace("Acme", "Other").replace("We hire", "Changed"));

		assertThat(first.path("id").asString()).isEqualTo(id);
		assertThat(again.path("id").asString()).isEqualTo(id);
		assertThat(first.path("title").asString()).isEqualTo("Engineer at Acme");
		assertThat(first.path("stage").asString()).isEqualTo("SAVED");
		assertThat(restApplication(id).path("company").asString()).isEqualTo("Acme");
		assertThat(jdbc.sql("select count(*) from items where type = 'APPLICATION'").query(Integer.class).single()).isEqualTo(1);
	}

	@Test
	void createApplicationWithAnotherUsersIdIsRefusedAndTheirApplicationIsUntouched() throws Exception {
		var other = newUser("b@example.com");
		var theirs = id(post("/api/applications", other, "{\"company\":\"Theirs\",\"role\":\"Spy\"}").body());

		var error = callFails("create_application", "{\"id\":\"" + theirs + "\",\"company\":\"Mine\",\"role\":\"Dev\"}");

		assertThat(error).contains("cannot be used");
		assertThat(JSON.readTree(get("/api/applications/" + theirs, other).body()).path("company").asString()).isEqualTo("Theirs");
	}

	@Test
	void getApplicationReturnsTheFieldsAndTheTimelineAndListApplicationsFiltersByStage() throws Exception {
		var id = create("Acme", "Engineer");
		create("Beta", "Designer");
		call("move_application_stage", "{\"id\":\"" + id + "\",\"stage\":\"APPLIED\"}");

		var detail = call("get_application", "{\"id\":\"" + id + "\"}");
		assertThat(detail.path("company").asString()).isEqualTo("Acme");
		assertThat(detail.path("stage").asString()).isEqualTo("APPLIED");
		assertThat(detail.path("nextStep").path("label").asString()).isNotBlank();
		assertThat(detail.path("timeline")).hasSize(2);
		assertThat(detail.path("version").asInt()).isEqualTo(2);

		var all = call("list_applications", "{}");
		assertThat(all.path("total").asInt()).isEqualTo(2);
		var applied = call("list_applications", "{\"stage\":\"APPLIED\"}");
		assertThat(applied.path("total").asInt()).isEqualTo(1);
		assertThat(applied.path("applications").get(0).path("id").asString()).isEqualTo(id);
	}

	@Test
	void anAgentsStageMoveWritesATimelineEntryAndClosingNeedsAReason() throws Exception {
		var id = create("Acme", "Engineer");

		var moved = call("move_application_stage", "{\"id\":\"" + id + "\",\"stage\":\"APPLIED\"}");
		assertThat(moved.path("stage").asString()).isEqualTo("APPLIED");
		var timeline = restApplication(id).path("timeline");
		assertThat(timeline).hasSize(2);
		assertThat(timeline.get(1).path("type").asString()).isEqualTo("STAGE");
		assertThat(timeline.get(1).path("stage").asString()).isEqualTo("APPLIED");
		assertThat(restApplication(id).path("appliedOn").asString()).isNotBlank();

		assertThat(callFails("move_application_stage", "{\"id\":\"" + id + "\",\"stage\":\"CLOSED\"}")).contains("why it closed");
		var closed = call("move_application_stage",
				"{\"id\":\"" + id + "\",\"stage\":\"CLOSED\",\"closeReason\":\"WITHDREW\"}");
		assertThat(closed.path("closeReason").asString()).isEqualTo("WITHDREW");
	}

	@Test
	void anOldVersionIsRefusedAndNothingChangesAndTheVersionIsOptional() throws Exception {
		var id = create("Acme", "Engineer");
		call("update_application", "{\"id\":\"" + id + "\",\"version\":1,\"location\":\"Remote\"}");

		var error = callFails("update_application", "{\"id\":\"" + id + "\",\"version\":1,\"location\":\"Paris\"}");

		assertThat(error).contains("changed somewhere else");
		assertThat(restApplication(id).path("location").asString()).isEqualTo("Remote");
		// Without a version the Agent's change applies to the Application as it is.
		call("move_application_stage", "{\"id\":\"" + id + "\",\"stage\":\"SCREENING\"}");
		assertThat(restApplication(id).path("stage").asString()).isEqualTo("SCREENING");
	}

	@Test
	void updateApplicationChangesOnlyWhatIsGivenAndRenamesTheTitleWithCompanyAndRole() throws Exception {
		var id = create("Acme", "Engineer");

		var saved = call("update_application",
				"{\"id\":\"" + id + "\",\"company\":\"Beta\",\"postingUrl\":\"https://beta.example/jobs/1\"}");

		assertThat(saved.path("title").asString()).isEqualTo("Engineer at Beta");
		var rest = restApplication(id);
		assertThat(rest.path("role").asString()).isEqualTo("Engineer");
		assertThat(rest.path("postingUrl").asString()).isEqualTo("https://beta.example/jobs/1");
	}

	@Test
	void addApplicationNoteAddsALineToTheTimeline() throws Exception {
		var id = create("Acme", "Engineer");

		call("add_application_note", "{\"id\":\"" + id + "\",\"text\":\"Recruiter called\"}");

		var timeline = restApplication(id).path("timeline");
		assertThat(timeline.get(timeline.size() - 1).path("type").asString()).isEqualTo("NOTE");
		assertThat(timeline.get(timeline.size() - 1).path("text").asString()).isEqualTo("Recruiter called");
		assertThat(callFails("add_application_note", "{\"id\":\"" + id + "\",\"text\":\"  \"}")).isNotBlank();
	}

	@Test
	void theApplicationToolsAreScopedToTheCallingUser() throws Exception {
		var other = newUser("b@example.com");
		var theirs = id(post("/api/applications", other, "{\"company\":\"Theirs\",\"role\":\"Spy\"}").body());

		for (var tool : new String[][] { { "get_application", "{\"id\":\"" + theirs + "\"}" },
				{ "update_application", "{\"id\":\"" + theirs + "\",\"location\":\"x\"}" },
				{ "move_application_stage", "{\"id\":\"" + theirs + "\",\"stage\":\"APPLIED\"}" },
				{ "add_application_note", "{\"id\":\"" + theirs + "\",\"text\":\"x\"}" },
				{ "trash_item", "{\"id\":\"" + theirs + "\"}" } }) {
			assertThat(callFails(tool[0], tool[1])).as(tool[0]).containsIgnoringCase("no such");
		}
		assertThat(call("list_applications", "{}").path("total").asInt()).isZero();
		assertThat(JSON.readTree(get("/api/applications/" + theirs, other).body()).path("stage").asString()).isEqualTo("SAVED");
	}

	@Test
	void theGenericItemToolsAcceptAnApplication() throws Exception {
		var id = create("Acme", "Engineer");
		var folder = folder("Jobs");

		var item = call("get_item", "{\"id\":\"" + id + "\"}");
		assertThat(item.path("type").asString()).isEqualTo("APPLICATION");
		assertThat(item.path("title").asString()).isEqualTo("Engineer at Acme");

		call("move_item", "{\"id\":\"" + id + "\",\"folderId\":\"" + folder + "\"}");
		assertThat(restApplication(id).path("folderId").asString()).isEqualTo(folder);
		call("set_tags", "{\"id\":\"" + id + "\",\"tags\":[\"remote\"]}");
		assertThat(get("/api/items/" + id + "/tags", jwt).body()).contains("remote");
		assertThat(call("search", "{\"query\":\"Acme\"}").path("hits").get(0).path("id").asString()).isEqualTo(id);

		call("trash_item", "{\"id\":\"" + id + "\"}");
		assertThat(get("/api/applications/" + id, jwt).statusCode()).isEqualTo(404);
		assertThat(call("list_trash", "{}").toString()).contains(id);
		call("restore", "{\"id\":\"" + id + "\"}");
		assertThat(get("/api/applications/" + id, jwt).statusCode()).isEqualTo(200);
	}

}
