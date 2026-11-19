package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The Career tools: Facts and Career results through the MCP, checked against the REST API. */
class McpCareerToolsApiTest extends McpApiTest {

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

	@Test
	void theCareerToolsAreListed() throws Exception {
		var names = new ArrayList<String>();
		rpc(token, "tools/list", "{}").path("result").path("tools").forEach(t -> names.add(t.path("name").asString()));

		assertThat(names).contains("list_facts", "get_fact", "add_fact", "switch_off_fact", "forget_fact", "get_application_results");
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
	void anAgentCanForgetAFactForGood() throws Exception {
		var noteId = note(jwt, "Billing", "Built the billing service in Go.", null);
		var args = "{\"text\":\"Built the billing service\",\"category\":\"EXPERIENCE\",\"sourceKind\":\"NOTE\",\"sourceId\":\""
				+ noteId + "\",\"quote\":\"Built the billing service in Go\"}";
		var pulled = call("add_fact", args).path("id").asString();
		var off = addFact("Taught a course", "EDUCATION");
		call("switch_off_fact", "{\"id\":\"" + off + "\"}");

		call("forget_fact", "{\"id\":\"" + pulled + "\"}");
		call("forget_fact", "{\"id\":\"" + off + "\"}");

		assertThat(get("/api/knowledge/facts", jwt).body()).doesNotContain(pulled).doesNotContain(off);
		assertThat(callFails("add_fact", args)).isNotBlank();
		assertThat(callFails("forget_fact", "{\"id\":\"" + pulled + "\"}")).containsIgnoringCase("no such");
	}

	@Test
	void anotherUsersFactCannotBeSwitchedOffOrForgotten() throws Exception {
		var mine = addFact("Shipped a payments API", "ACHIEVEMENT");
		var otherToken = newToken(newUser("b@example.com"));

		assertThat(failsFor(otherToken, "switch_off_fact", "{\"id\":\"" + mine + "\"}")).containsIgnoringCase("no such");
		assertThat(failsFor(otherToken, "forget_fact", "{\"id\":\"" + mine + "\"}")).containsIgnoringCase("no such");
		assertThat(callFails("forget_fact", "{\"id\":\"" + UUID.randomUUID() + "\"}")).containsIgnoringCase("no such");
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

}
