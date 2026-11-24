package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import com.coreex.TestModel;

import tools.jackson.databind.JsonNode;

/** The Career tools: Facts and Career results through the MCP, checked against the REST API. */
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01" })
class McpCareerToolsApiTest extends McpApiTest {

	private static final String FIT_NO_REQUIREMENTS = "{\"question\":\"Why?\",\"requirements\":[]}";

	@Autowired TestModel model;

	@BeforeEach
	void fakeModel() {
		model.clear();
		model.tokens(1, 1);
	}

	/** The error text of a tool call made with the given Access token. */
	private String failsFor(String bearer, String tool, String arguments) throws Exception {
		var result = rpc(bearer, "tools/call", "{\"name\":\"" + tool + "\",\"arguments\":" + arguments + "}").path("result");
		assertThat(result.path("isError").asBoolean()).as(result.toString()).isTrue();
		return result.path("content").get(0).path("text").asString();
	}

	private String addFact(String text, String category) throws Exception {
		return call("add_fact", "{\"text\":\"" + text + "\",\"category\":\"" + category + "\"}").path("id").asString();
	}

	private JsonNode listFacts() throws Exception {
		return call("list_facts", "{}");
	}

	private String application(String bearer) throws Exception {
		return call(bearer, "create_application", "{\"company\":\"Acme\",\"role\":\"Engineer\",\"postingText\":\"Build APIs\"}")
				.path("id").asString();
	}

	private JsonNode results(String application) throws Exception {
		return call("get_application_results", "{\"applicationId\":\"" + application + "\"}").path("results");
	}

	private static String appArgs(String application) {
		return "{\"applicationId\":\"" + application + "\"}";
	}

	/** The arguments of save_fit_check: the fit is a JSON string inside them, so it is escaped by the mapper. */
	private static String saveArgs(String application, String fit) throws Exception {
		return JSON.writeValueAsString(Map.of("applicationId", application, "fit", fit));
	}

	@Test
	void theCareerToolsAreListed() throws Exception {
		var names = new ArrayList<String>();
		rpc(token, "tools/list", "{}").path("result").path("tools").forEach(t -> names.add(t.path("name").asString()));

		assertThat(names).contains("list_facts", "get_fact", "add_fact", "switch_off_fact", "get_application_results", "run_fit_check",
				"save_fit_check");
	}

	@Test
	void aFactAddedByHandIsListedAndRead() throws Exception {
		var made = call("add_fact", "{\"text\":\"Led a team of four\",\"category\":\"ACHIEVEMENT\"}");
		var id = made.path("id").asString();

		assertThat(made.path("sourceKind").asString()).isEqualTo("MANUAL");
		assertThat(listFacts().path("facts").get(0).path("id").asString()).isEqualTo(id);
		assertThat(call("get_fact", "{\"id\":\"" + id + "\"}").path("text").asString()).isEqualTo("Led a team of four");
		assertThat(call("list_facts", "{\"category\":\"SKILL\"}").path("facts").size()).isZero();
		assertThat(callFails("add_fact", "{\"text\":\"x\",\"category\":\"JOB\"}")).containsIgnoringCase("category");
	}

	@Test
	void aFactPulledFromANoteNeedsAQuoteThatIsInIt() throws Exception {
		var noteId = note(jwt, "Billing", "Built the billing service in Go, and ran its on-call rota.", null);
		var args = "{\"text\":\"Built the billing service\",\"category\":\"EXPERIENCE\",\"sourceKind\":\"NOTE\",\"sourceId\":\""
				+ noteId + "\",\"quote\":\"Built the billing service in Go\"}";

		var pulled = call("add_fact", args);
		assertThat(pulled.path("sourceKind").asString()).isEqualTo("NOTE");
		assertThat(pulled.path("quote").asString()).isEqualTo("Built the billing service in Go");

		assertThat(callFails("add_fact", args.replace("in Go\"", "in Java\""))).containsIgnoringCase("not in");
		assertThat(callFails("add_fact", args.replace("\"quote\":\"Built the billing service in Go\"", "\"quote\":\"\""))).contains("quote");
		assertThat(callFails("add_fact", "{\"text\":\"x\",\"category\":\"SKILL\",\"sourceKind\":\"NOTE\"}")).contains("sourceId");
	}

	@Test
	void aSwitchedOffFactIsHiddenAndAForgottenFactIsGone() throws Exception {
		var off = addFact("Ran a hackathon", "EXPERIENCE");
		var forgotten = addFact("Taught a course", "EDUCATION");

		assertThat(put("/api/knowledge/facts/" + off + "/status", jwt, "{\"status\":\"OFF\"}").statusCode()).isEqualTo(200);
		assertThat(listFacts().toString()).doesNotContain(off);
		assertThat(callFails("get_fact", "{\"id\":\"" + off + "\"}")).containsIgnoringCase("no such");

		assertThat(delete("/api/knowledge/facts/" + forgotten, jwt).statusCode()).isEqualTo(204);
		assertThat(listFacts().toString()).doesNotContain(forgotten);
		assertThat(callFails("get_fact", "{\"id\":\"" + forgotten + "\"}")).containsIgnoringCase("no such");
	}

	@Test
	void anAgentCanSwitchOffAFact() throws Exception {
		var id = addFact("Ran a hackathon", "EXPERIENCE");

		assertThat(call("switch_off_fact", "{\"id\":\"" + id + "\"}").path("id").asString()).isEqualTo(id);

		assertThat(listFacts().toString()).doesNotContain(id);
		assertThat(callFails("get_fact", "{\"id\":\"" + id + "\"}")).containsIgnoringCase("no such");
		assertThat(get("/api/knowledge/facts?status=OFF", jwt).body()).contains(id);
		// An Agent cannot see an off Fact, so switching it off again is "no such Fact".
		assertThat(callFails("switch_off_fact", "{\"id\":\"" + id + "\"}")).containsIgnoringCase("no such");
	}

	@Test
	void anotherUsersFactCannotBeSwitchedOff() throws Exception {
		var mine = addFact("Shipped a payments API", "ACHIEVEMENT");
		var otherToken = newToken(newUser("b@example.com"));

		assertThat(failsFor(otherToken, "switch_off_fact", "{\"id\":\"" + mine + "\"}")).containsIgnoringCase("no such");
		assertThat(callFails("switch_off_fact", "{\"id\":\"" + UUID.randomUUID() + "\"}")).containsIgnoringCase("no such");
		assertThat(call("get_fact", "{\"id\":\"" + mine + "\"}").path("text").asString()).isEqualTo("Shipped a payments API");
	}

	@Test
	void anotherUsersFactsAndApplicationResultsAreNotVisible() throws Exception {
		var mine = addFact("Shipped a payments API", "ACHIEVEMENT");
		var application = call("create_application", "{\"company\":\"Acme\",\"role\":\"Engineer\",\"postingText\":\"Build APIs\"}")
				.path("id").asString();

		var otherJwt = newUser("b@example.com");
		var otherToken = newToken(otherJwt);

		assertThat(failsFor(otherToken, "get_fact", "{\"id\":\"" + mine + "\"}")).containsIgnoringCase("no such");
		assertThat(call(otherToken, "list_facts", "{}").path("facts").size()).isZero();
		assertThat(failsFor(otherToken, "get_application_results", "{\"applicationId\":\"" + application + "\"}"))
				.containsIgnoringCase("no such");
	}

	@Test
	void applicationResultsReturnTheStoredFitCheck() throws Exception {
		var application = call("create_application", "{\"company\":\"Acme\",\"role\":\"Engineer\",\"postingText\":\"Build APIs\"}")
				.path("id").asString();
		// A Fit check as the Career AI stores it (career_results, V34); the fingerprint is not the current one, so it is out of date.
		jdbc.sql("""
				insert into career_results (owner_id, item_id, kind, data, input_fingerprint)
				select id, :app, 'FIT', :data::jsonb, 'stale' from users where email = 'a@example.com'""")
				.param("app", UUID.fromString(application))
				.param("data", "{\"score\":80,\"question\":\"Why?\",\"requirements\":[{\"requirement\":\"Builds APIs\","
						+ "\"verdict\":\"SUPPORTED\",\"evidence\":[],\"note\":\"Shown.\"}]}")
				.update();

		var results = call("get_application_results", "{\"applicationId\":\"" + application + "\"}").path("results");

		assertThat(results.size()).isEqualTo(1);
		assertThat(results.get(0).path("kind").asString()).isEqualTo("FIT");
		assertThat(results.get(0).path("result").path("score").asInt()).isEqualTo(80);
		assertThat(results.get(0).path("resolution").isNull()).isTrue();
		assertThat(results.get(0).path("createdAt").isMissingNode()).isFalse();
	}

	@Test
	void runFitCheckRunsTheFitCheckForTheOwnerWithTheModel() throws Exception {
		var application = application(token);
		var fact = addFact("Built the billing service", "EXPERIENCE");
		model.answer(JSON.writeValueAsString(Map.of("question", "Why?", "requirements", List.of(Map.of("requirement", "Builds APIs",
				"kind", "MUST", "verdict", "SUPPORTED", "evidence", List.of(fact), "note", "Shown.")))));

		var row = call("run_fit_check", appArgs(application));

		assertThat(row.path("kind").asString()).isEqualTo("FIT");
		assertThat(row.path("result").path("source").asString()).isEqualTo("COREEX");
		assertThat(row.path("result").path("score").asInt()).isEqualTo(100);
		assertThat(row.path("outOfDate").asBoolean()).isFalse();
		assertThat(model.asked()).hasSize(1);
		assertThat(results(application).size()).isEqualTo(1);
	}

	@Test
	void runFitCheckIsRefusedForAnotherUsersApplication() throws Exception {
		var application = application(token);
		var otherToken = newToken(newUser("b@example.com"));

		assertThat(failsFor(otherToken, "run_fit_check", appArgs(application))).containsIgnoringCase("no such");
		assertThat(model.asked()).isEmpty();
		assertThat(results(application).size()).isZero();
	}

	@Test
	void runFitCheckIsRefusedWithTheButtonsBudgetErrorWhenTheBudgetIsSpent() throws Exception {
		var application = application(token);
		model.answer(JSON.writeValueAsString(Map.of("question", "Why?", "requirements", List.of())));
		model.tokens(10_000_000, 0);

		// The first run is within the budget and spends it; the next is refused with the same message the Fit check button gives.
		call("run_fit_check", appArgs(application));
		assertThat(failsFor(token, "run_fit_check", appArgs(application))).containsIgnoringCase("today's AI budget");
	}

	@Test
	void saveFitCheckSavesTheAgentsAnswerWithAServerScoreAndNoModelCall() throws Exception {
		var application = application(token);
		var fact = addFact("Built the billing service", "EXPERIENCE");
		var fit = "{\"score\":99,\"question\":\"Why?\",\"priorities\":[\"Ships APIs\"],\"keywords\":[\"APIs\"],\"requirements\":"
				+ "[{\"requirement\":\"Builds APIs\",\"kind\":\"MUST\",\"verdict\":\"SUPPORTED\",\"evidence\":[\"" + fact
				+ "\"],\"note\":\"Shown.\"}]}";

		var row = call("save_fit_check", saveArgs(application, fit));

		assertThat(row.path("kind").asString()).isEqualTo("FIT");
		assertThat(row.path("result").path("source").asString()).isEqualTo("AGENT");
		assertThat(row.path("result").path("score").asInt()).isEqualTo(100);
		assertThat(model.asked()).isEmpty();
		assertThat(results(application).size()).isEqualTo(1);
	}

	@Test
	void saveFitCheckSpendsNoBudgetSoARunStillGoes() throws Exception {
		var application = application(token);
		model.tokens(10_000_000, 0);
		model.answer(JSON.writeValueAsString(Map.of("question", "Why?", "requirements", List.of())));

		// Two saves spend nothing, so the first model run is still within the budget.
		call("save_fit_check", saveArgs(application, FIT_NO_REQUIREMENTS));
		call("save_fit_check", saveArgs(application, FIT_NO_REQUIREMENTS));
		call("run_fit_check", appArgs(application));

		assertThat(model.asked()).hasSize(1);
		assertThat(failsFor(token, "run_fit_check", appArgs(application))).containsIgnoringCase("today's AI budget");
	}

	@Test
	void saveFitCheckIsRefusedForAnotherUsersApplication() throws Exception {
		var application = application(token);
		var otherToken = newToken(newUser("b@example.com"));

		assertThat(failsFor(otherToken, "save_fit_check", saveArgs(application, FIT_NO_REQUIREMENTS))).containsIgnoringCase("no such");
		assertThat(results(application).size()).isZero();
	}

	@Test
	void saveFitCheckDropsAFactOfAnotherUserAndTheRequirementIsMissing() throws Exception {
		var application = application(token);
		var theirs = call(newToken(newUser("b@example.com")), "add_fact",
				"{\"text\":\"Shipped a payments API\",\"category\":\"ACHIEVEMENT\"}").path("id").asString();
		var fit = "{\"question\":\"Why?\",\"requirements\":[{\"requirement\":\"Builds APIs\",\"kind\":\"MUST\",\"verdict\":\"SUPPORTED\","
				+ "\"evidence\":[\"" + theirs + "\"],\"note\":\"n\"}]}";

		var row = call("save_fit_check", saveArgs(application, fit));

		var requirement = row.path("result").path("requirements").get(0);
		assertThat(requirement.path("verdict").asString()).isEqualTo("MISSING");
		assertThat(requirement.path("evidence").size()).isZero();
		assertThat(row.path("result").path("score").asInt()).isZero();
		assertThat(row.toString()).doesNotContain("Shipped a payments API");
	}

	@Test
	void saveFitCheckRefusesBrokenJsonAndSavesNothing() throws Exception {
		var application = application(token);

		assertThat(callFails("save_fit_check", saveArgs(application, "{not json"))).containsIgnoringCase("nothing was saved");
		assertThat(results(application).size()).isZero();
	}

	@Test
	void saveFitCheckRefusesATooLongTextAndSavesNothing() throws Exception {
		var application = application(token);
		var fit = "{\"question\":\"" + "x".repeat(60_001) + "\",\"requirements\":[]}";

		assertThat(callFails("save_fit_check", saveArgs(application, fit))).containsIgnoringCase("too long");
		assertThat(results(application).size()).isZero();
	}

	@Test
	void aSavedFitCheckIsOutOfDateAfterAFactIsAddedOrEdited() throws Exception {
		var application = application(token);
		call("save_fit_check", saveArgs(application, FIT_NO_REQUIREMENTS));
		assertThat(results(application).get(0).path("outOfDate").asBoolean()).isFalse();

		var added = addFact("Built the billing service", "EXPERIENCE");
		assertThat(results(application).get(0).path("outOfDate").asBoolean()).isTrue();

		call("save_fit_check", saveArgs(application, FIT_NO_REQUIREMENTS));
		assertThat(results(application).get(0).path("outOfDate").asBoolean()).isFalse();

		assertThat(put("/api/knowledge/facts/" + added, jwt, "{\"text\":\"Built the invoicing service\",\"category\":\"EXPERIENCE\"}")
				.statusCode()).isEqualTo(200);
		assertThat(results(application).get(0).path("outOfDate").asBoolean()).isTrue();
	}

}
