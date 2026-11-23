package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestModel;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.daily-budget-usd=0.01" })
class CareerEmailApiTest extends ApiTest {

	@Autowired JdbcClient jdbc;
	@Autowired TestModel model;
	private final JsonMapper json = JsonMapper.builder().build();
	private String owner;
	private String other;
	private String application;

	private String token(String email) {
		var user = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", user).param("email", email).update();
		return TestJwts.tokenFor(user, email);
	}

	private String id(String body) { return json.readTree(body).get("id").asText(); }

	private String path(String app) { return "/api/applications/" + app + "/career"; }

	private String newApplication(String token, String posting) throws Exception {
		var body = new HashMap<String, Object>();
		body.put("company", "Example");
		body.put("role", "Engineer");
		if (posting != null) body.put("postingText", posting);
		return id(post("/api/applications", token, json.writeValueAsString(body)).body());
	}

	private String fact(String text) throws Exception {
		return id(post("/api/knowledge/facts", owner, json.writeValueAsString(Map.of("text", text, "category", "EXPERIENCE"))).body());
	}

	private String resume(String token) throws Exception {
		return id(post("/api/resumes", token, "{\"sample\":true}").body());
	}

	private void link(String app, String token, String kind, String item) throws Exception {
		assertThat(put("/api/applications/" + app + "/linked-documents", token, "{\"kind\":\"" + kind + "\",\"itemId\":\"" + item + "\"}")
				.statusCode()).isLessThan(300);
	}

	/** Adds an interview to the Application and returns its seq in the timeline. */
	private int interview(String app, String startsAt, String kind) throws Exception {
		var version = json.readTree(get("/api/applications/" + app, owner).body()).get("version").asInt();
		var added = post("/api/applications/" + app + "/interviews", owner, json.writeValueAsString(Map.of("startsAt", startsAt,
				"kind", kind, "notes", "", "version", version)));
		assertThat(added.statusCode()).as(added.body()).isEqualTo(201);
		int seq = 0;
		for (var entry : json.readTree(added.body()).get("timeline")) {
			if (entry.get("type").asText().equals("INTERVIEW")) seq = Math.max(seq, entry.get("seq").asInt());
		}
		return seq;
	}

	private void debrief(String app, int seq) throws Exception {
		var body = json.writeValueAsString(Map.of("notes", "Good rapport.", "questions",
				List.of(Map.of("question", "Why this role?", "landed", "WELL", "note", "Went well."))));
		assertThat(put("/api/applications/" + app + "/career/interviews/" + seq + "/debrief", owner, body).statusCode()).isEqualTo(200);
	}

	/** The answer every email call gets: a subject, a body, the documents to attach and the evidence cited. */
	private void emailAnswer(List<String> attach, List<String> evidence) throws Exception {
		model.answer(json.writeValueAsString(Map.of("subject", "Application for the Engineer role", "body", "Hello, I would like to apply.",
				"attach", attach, "evidence", evidence)));
	}

	private HttpResponse<String> draftEmail(String app, String token, String kind, Integer seq) throws Exception {
		var body = new HashMap<String, Object>();
		body.put("kind", kind);
		body.put("interviewSeq", seq);
		return post(path(app) + "/emails", token, json.writeValueAsString(body));
	}

	private JsonNode library(String app, String token) throws Exception {
		var r = get(path(app) + "/results", token);
		assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
		return json.readTree(r.body());
	}

	private String draftedId(HttpResponse<String> made) throws Exception {
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		return id(made.body());
	}

	@BeforeEach
	void prepare() throws Exception {
		jdbc.sql("delete from users").update();
		model.clear();
		model.tokens(1, 1);
		owner = token("owner@example.com");
		other = token("other@example.com");
		application = newApplication(owner, "Build web services");
	}

	@Test
	void anApplicationEmailIsSavedWithItsSubjectAndBody() throws Exception {
		emailAnswer(List.of(), List.of());
		var made = draftEmail(application, owner, "APPLICATION", null);
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		var result = json.readTree(made.body());
		assertThat(result.get("kind").asText()).isEqualTo("EMAIL");
		assertThat(result.at("/email/subject").asText()).isEqualTo("Application for the Engineer role");
		assertThat(result.at("/email/body").asText()).isEqualTo("Hello, I would like to apply.");
		var listed = library(application, owner);
		assertThat(listed.at("/results/0/email/body").asText()).isEqualTo("Hello, I would like to apply.");
		assertThat(listed.at("/sends/EMAIL").asText()).startsWith("Sends:");
	}

	@Test
	void aCitedIdThatWasNotGivenIsDropped() throws Exception {
		var given = fact("Built web services for three years.");
		emailAnswer(List.of(), List.of(UUID.randomUUID().toString(), given));
		var made = json.readTree(draftEmail(application, owner, "APPLICATION", null).body());
		assertThat(made.at("/email/evidence")).hasSize(1);
		assertThat(made.at("/email/evidence/0/id").asText()).isEqualTo(given);
	}

	@Test
	void anAttachmentIsLimitedToTheDocumentsLinkedOnTheApplication() throws Exception {
		link(application, owner, "RESUME", resume(owner));
		emailAnswer(List.of("RESUME", "COVER_LETTER"), List.of());
		var made = json.readTree(draftEmail(application, owner, "APPLICATION", null).body());
		assertThat(made.at("/email/attach")).hasSize(1);
		assertThat(made.at("/email/attach/0").asText()).isEqualTo("RESUME");
		assertThat(model.asked().get(model.asked().size() - 1).data()).contains("<attachments><file kind=\"RESUME\">");
	}

	@Test
	void noPostingTextIsRefusedBeforeTheModelIsCalled() throws Exception {
		var bare = newApplication(owner, null);
		emailAnswer(List.of(), List.of());
		var refused = draftEmail(bare, owner, "APPLICATION", null);
		assertThat(refused.statusCode()).isEqualTo(400);
		assertThat(refused.body()).contains("INVALID_REQUEST");
		assertThat(model.asked()).isEmpty();
	}

	@Test
	void anotherUserGets404ForDraftingAndEditing() throws Exception {
		emailAnswer(List.of(), List.of());
		var rid = draftedId(draftEmail(application, owner, "APPLICATION", null));
		model.clear();
		assertThat(draftEmail(application, other, "APPLICATION", null).statusCode()).isEqualTo(404);
		assertThat(draftEmail(application, other, "FOLLOW_UP", null).statusCode()).isEqualTo(404);
		assertThat(put(path(application) + "/results/" + rid + "/email", other, "{\"subject\":\"Mine\",\"body\":\"Mine.\"}").statusCode())
				.isEqualTo(404);
		assertThat(model.asked()).isEmpty();
	}

	@Test
	void editingSavesTheTextAndSurvivesAReReadWithoutGoingOutOfDate() throws Exception {
		emailAnswer(List.of(), List.of());
		var rid = draftedId(draftEmail(application, owner, "APPLICATION", null));
		var edited = put(path(application) + "/results/" + rid + "/email", owner, "{\"subject\":\"Edited subject\",\"body\":\"Edited body.\"}");
		assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
		assertThat(json.readTree(edited.body()).at("/email/subject").asText()).isEqualTo("Edited subject");
		assertThat(json.readTree(edited.body()).get("outOfDate").asBoolean()).isFalse();
		var listed = library(application, owner);
		assertThat(listed.at("/results/0/email/subject").asText()).isEqualTo("Edited subject");
		assertThat(listed.at("/results/0/email/body").asText()).isEqualTo("Edited body.");
		assertThat(listed.at("/results/0/outOfDate").asBoolean()).isFalse();
		assertThat(put(path(application) + "/results/" + rid + "/email", owner, "{\"subject\":\" \",\"body\":\"Body.\"}").statusCode())
				.isEqualTo(400);
	}

	@Test
	void editingOnlyAppliesToEmailResults() throws Exception {
		model.answer(json.writeValueAsString(Map.of("question", "Why?", "requirements", List.of())));
		var fit = id(post(path(application) + "/fit", owner, "").body());
		assertThat(put(path(application) + "/results/" + fit + "/email", owner, "{\"subject\":\"Hi\",\"body\":\"Body.\"}").statusCode())
				.isEqualTo(404);
	}

	@Test
	void aFollowUpNeedsAnAppliedApplicationThenWorks() throws Exception {
		emailAnswer(List.of(), List.of());
		var before = draftEmail(application, owner, "FOLLOW_UP", null);
		assertThat(before.statusCode()).isEqualTo(400);
		assertThat(before.body()).contains("Mark this Application as applied first.");
		// Marking applied checks the documents, so a Resume must be attached first.
		link(application, owner, "RESUME", resume(owner));
		assertThat(post(path(application) + "/mark-applied", owner, "").statusCode()).isLessThan(300);
		var after = draftEmail(application, owner, "FOLLOW_UP", null);
		assertThat(after.statusCode()).as(after.body()).isEqualTo(201);
		var result = json.readTree(after.body());
		assertThat(result.get("kind").asText()).isEqualTo("FOLLOW_UP");
		assertThat(result.at("/email/attach")).isEmpty();
	}

	@Test
	void aThankYouNeedsADebriefThenUsesOnlyTheDebrief() throws Exception {
		var seq = interview(application, "2026-11-10T10:00:00Z", "VIDEO");
		emailAnswer(List.of(), List.of());
		assertThat(draftEmail(application, owner, "THANK_YOU", seq).statusCode()).isEqualTo(404);
		assertThat(draftEmail(application, owner, "THANK_YOU", null).statusCode()).isEqualTo(400);
		debrief(application, seq);
		var made = draftEmail(application, owner, "THANK_YOU", seq);
		assertThat(made.statusCode()).as(made.body()).isEqualTo(201);
		var result = json.readTree(made.body());
		assertThat(result.get("kind").asText()).isEqualTo("THANK_YOU");
		assertThat(result.at("/email/interviewSeq").asInt()).isEqualTo(seq);
		assertThat(model.asked().get(model.asked().size() - 1).data()).contains("<debrief>", "<interview kind=\"VIDEO\"")
				.doesNotContain("<posting>", "<application");
	}

	@Test
	void changingThePostingMarksAnEmailOutOfDate() throws Exception {
		emailAnswer(List.of(), List.of());
		draftedId(draftEmail(application, owner, "APPLICATION", null));
		assertThat(library(application, owner).at("/results/0/outOfDate").asBoolean()).isFalse();
		var current = json.readTree(get("/api/applications/" + application, owner).body());
		var saved = put("/api/applications/" + application, owner, json.writeValueAsString(Map.of("title", current.get("title").asText(),
				"company", "Example", "role", "Engineer", "location", "", "postingUrl", "", "postingText", "Build web services and lead a team",
				"version", current.get("version").asInt())));
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		assertThat(library(application, owner).at("/results/0/outOfDate").asBoolean()).isTrue();
	}

	@Test
	void aTrashedApplicationHidesItsEmails() throws Exception {
		emailAnswer(List.of(), List.of());
		draftedId(draftEmail(application, owner, "APPLICATION", null));
		assertThat(delete("/api/applications/" + application, owner).statusCode()).isEqualTo(204);
		assertThat(get(path(application) + "/results", owner).statusCode()).isEqualTo(404);
	}

}
