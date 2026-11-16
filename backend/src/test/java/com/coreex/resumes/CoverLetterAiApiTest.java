package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;

import tools.jackson.databind.json.JsonMapper;

@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01" })
class CoverLetterAiApiTest extends ApiTest {

	@Autowired JdbcClient jdbc;
	@Autowired TestModel model;
	private final JsonMapper json = JsonMapper.builder().build();
	private String owner;
	private String other;
	private String letter;
	private String resume;
	private String application;

	private String token(String email) {
		var user = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", user).param("email", email).update();
		return TestJwts.tokenFor(user, email);
	}

	private String id(String body) { return json.readTree(body).get("id").asText(); }

	@BeforeEach
	void prepare() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		owner = token("owner@example.com");
		other = token("other@example.com");
		resume = id(post("/api/resumes", owner, "{\"sample\":true}").body());
		letter = id(post("/api/cover-letters", owner, "{\"title\":\"Letter\"}").body());
		application = id(post("/api/applications", owner,
				"{\"company\":\"Example\",\"role\":\"Engineer\",\"postingText\":\"Build services\"}").body());
	}

	private String request(String mode, String previous) {
		return "{\"applicationId\":\"" + application + "\",\"resumeId\":\"" + resume + "\",\"version\":1,\"mode\":\"" + mode
				+ "\"" + (previous == null ? "" : ",\"draftId\":\"" + previous + "\"") + "}";
	}

	@Test
	void draftAndBothRevisionsAreKeptWithoutChangingTheLetter() throws Exception {
		model.tokens(1, 1);
		model.answer("{\"body\":\"<p>I build reliable services.</p>\"}");
		String previous = null;
		for (var mode : new String[] { "DRAFT", "SHORTER", "PERSONAL" }) {
			var result = post("/api/cover-letters/" + letter + "/drafts", owner, request(mode, previous));
			assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
			previous = id(result.body());
		}
		assertThat(get("/api/cover-letters/" + letter + "/drafts", owner).body()).contains("DRAFT", "SHORTER", "PERSONAL");
		assertThat(get("/api/cover-letters/" + letter, owner).body()).doesNotContain("I build reliable services.");
		assertThat(get("/api/cover-letters/" + letter + "/drafts", other).statusCode()).isEqualTo(404);
		assertThat(model.asked().get(0).system()).contains("untrusted", "never");
	}

	@Test
	void budgetStopsDraftingAndNoProposalIsStored() throws Exception {
		model.answer("{\"body\":\"<p>Service engineer.</p>\"}");
		assertThat(post("/api/cover-letters/" + letter + "/drafts", owner, request("DRAFT", null)).statusCode()).isEqualTo(201);
		assertThat(post("/api/cover-letters/" + letter + "/drafts", owner, request("DRAFT", null)).statusCode()).isEqualTo(201);
		var refused = post("/api/cover-letters/" + letter + "/drafts", owner, request("DRAFT", null));
		assertThat(refused.statusCode()).isEqualTo(429);
		assertThat(refused.body()).contains("AI_BUDGET_SPENT");
	}

	@Test
	void acceptingAProposalReplacesTheBodyButAStaleOneIsRefused() throws Exception {
		model.tokens(1, 1);
		model.answer("{\"body\":\"<p>Reliable services.</p>\"}");
		var result = post("/api/cover-letters/" + letter + "/drafts", owner, request("DRAFT", null));
		assertThat(result.statusCode()).as(result.body()).isEqualTo(201);
		var draft = id(result.body());
		assertThat(post("/api/cover-letters/" + letter + "/drafts/" + draft + "/accept", other, "{\"version\":1}").statusCode()).isEqualTo(404);
		var accepted = post("/api/cover-letters/" + letter + "/drafts/" + draft + "/accept", owner, "{\"version\":1}");
		assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(200);
		assertThat(accepted.body()).contains("Reliable services.");
		assertThat(post("/api/cover-letters/" + letter + "/drafts/" + draft + "/accept", owner, "{\"version\":2}").statusCode()).isEqualTo(409);
	}

	@Test
	void rejectsMalformedOrInventedNumbersWithoutSavingAProposal() throws Exception {
		model.tokens(1, 1);
		for (var answer : new String[] { "not json", "{\"body\":\"<p>Raised revenue by 999999%.</p>\"}" }) {
			model.answer(answer);
			var result = post("/api/cover-letters/" + letter + "/drafts", owner, request("DRAFT", null));
			assertThat(result.statusCode()).as(result.body()).isEqualTo(502);
			assertThat(result.body()).contains("AI_BAD_ANSWER");
		}
		assertThat(get("/api/cover-letters/" + letter + "/drafts", owner).body()).isEqualTo("[]");
	}

	@Test
	void sourceChangesMakeTheDraftStaleAndItCannotBeAccepted() throws Exception {
		model.tokens(1, 1);
		model.answer("{\"body\":\"<p>Reliable services.</p>\"}");
		var draft = id(post("/api/cover-letters/" + letter + "/drafts", owner, request("DRAFT", null)).body());
		assertThat(put("/api/resumes/" + resume, owner,
				"{\"title\":\"New\",\"version\":1,\"document\":{\"summary\":\"<p>Different experience</p>\"}}").statusCode()).isEqualTo(200);
		assertThat(get("/api/cover-letters/" + letter + "/drafts", owner).body()).contains("\"stale\":true");
		assertThat(post("/api/cover-letters/" + letter + "/drafts", owner, request("SHORTER", draft)).statusCode()).isEqualTo(409);
		assertThat(post("/api/cover-letters/" + letter + "/drafts/" + draft + "/accept", owner, "{\"version\":1}").statusCode()).isEqualTo(409);
		assertThat(get("/api/cover-letters/" + letter, owner).body()).doesNotContain("Reliable services.");
	}
}
