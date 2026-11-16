package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

/** The same posting is not tracked twice, and a company that never answered is remembered. */
class ApplicationDuplicateApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	private String userA;

	private String userB;

	@BeforeEach
	void clean() {
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

	private java.net.http.HttpResponse<String> create(String token, String company, String url) throws Exception {
		return post("/api/applications", token,
				"{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"postingUrl\":\"" + url + "\"}");
	}

	private String made(String token, String company, String url) throws Exception {
		var created = create(token, company, url);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return field(created.body(), "id");
	}

	private void close(String token, String id, String reason) throws Exception {
		var closed = post("/api/applications/" + id + "/stage", token,
				"{\"stage\":\"CLOSED\",\"closeReason\":\"" + reason + "\",\"fromStage\":\"SAVED\"}");
		assertThat(closed.statusCode()).as(closed.body()).isEqualTo(200);
	}

	private String appliedBefore(String token, String company, String extra) throws Exception {
		var response = get("/api/applications/applied-before?company=" + URLEncoder.encode(company, StandardCharsets.UTF_8) + extra, token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return response.body();
	}

	@Test
	void theSamePostingByAnyOfItsLinksIsRefusedWithAPointerToTheExistingOne() throws Exception {
		var first = made(userA, "Acme", "https://www.jobs.example/job/123?utm_source=x&gh_jid=77#top");

		var again = create(userA, "Acme", "https://jobs.example/job/123/?gh_jid=77&utm_campaign=y");

		assertThat(again.statusCode()).isEqualTo(409);
		assertThat(field(again.body(), "code")).isEqualTo("DUPLICATE_POSTING");
		assertThat(field(again.body(), "existingId")).isEqualTo(first);
		assertThat(again.body()).contains("Engineer at Acme");
		// A different job on the same site is fine, and so is a posting with no link at all, as often as you like.
		assertThat(create(userA, "Acme", "https://jobs.example/job/123?gh_jid=78").statusCode()).isEqualTo(201);
		assertThat(create(userA, "Beta", "").statusCode()).isEqualTo(201);
		assertThat(create(userA, "Gamma", "").statusCode()).isEqualTo(201);
	}

	@Test
	void aTrashedPostingAndAnotherUsersPostingAreNotDuplicates() throws Exception {
		var url = "https://jobs.example/job/9";
		var first = made(userA, "Acme", url);

		assertThat(create(userB, "Acme", url).statusCode()).isEqualTo(201);
		assertThat(create(userA, "Acme", url).statusCode()).isEqualTo(409);
		delete("/api/applications/" + first, userA);
		assertThat(create(userA, "Acme", url).statusCode()).isEqualTo(201);
	}

	@Test
	void savingALinkThatBelongsToAnotherApplicationIsRefusedButResavingYourOwnIsNot() throws Exception {
		var one = made(userA, "Acme", "https://jobs.example/job/1");
		var two = made(userA, "Beta", "https://jobs.example/job/2");
		var current = get("/api/applications/" + two, userA).body();

		var clash = put("/api/applications/" + two, userA, "{\"title\":\"Engineer at Beta\",\"company\":\"Beta\",\"role\":\"Engineer\","
				+ "\"location\":\"\",\"postingUrl\":\"https://www.jobs.example/job/1/?utm_source=z\",\"postingText\":\"\",\"version\":"
				+ field(current, "version") + "}");
		assertThat(clash.statusCode()).isEqualTo(409);
		assertThat(field(clash.body(), "code")).isEqualTo("DUPLICATE_POSTING");
		assertThat(field(clash.body(), "existingId")).isEqualTo(one);

		var same = put("/api/applications/" + two, userA, "{\"title\":\"Engineer at Beta\",\"company\":\"Beta\",\"role\":\"Engineer\","
				+ "\"location\":\"Remote\",\"postingUrl\":\"https://jobs.example/job/2?utm_source=z\",\"postingText\":\"\",\"version\":"
				+ field(current, "version") + "}");
		assertThat(same.statusCode()).as(same.body()).isEqualTo(200);
	}

	@Test
	void aCompanyThatNeverAnsweredIsFoundByAnyCaseAndSpacingAndOnlyForYou() throws Exception {
		var silent = made(userA, "Acme  Corp", "");
		close(userA, silent, "NO_RESPONSE");
		var withdrew = made(userA, "Beta", "");
		close(userA, withdrew, "WITHDREW");
		made(userA, "Gamma", "");
		made(userB, "Acme Corp", "");

		var found = appliedBefore(userA, "  acme corp ", "");
		assertThat(found).contains("\"id\":\"" + silent + "\"").contains("Engineer at Acme  Corp");
		assertThat(appliedBefore(userA, "Beta", "")).contains("\"items\":[]");
		assertThat(appliedBefore(userA, "Gamma", "")).contains("\"items\":[]");
		assertThat(appliedBefore(userB, "Acme Corp", "")).contains("\"items\":[]");
		assertThat(appliedBefore(userA, "Acme Corp", "&excludeId=" + silent)).contains("\"items\":[]");
		assertThat(appliedBefore(userA, "  ", "")).contains("\"items\":[]");
	}

	@Test
	void aNoResponseCloseIsRememberedAfterTheApplicationIsMovedOnAgainButNotWhenTrashed() throws Exception {
		var id = made(userA, "Acme", "");
		close(userA, id, "NO_RESPONSE");
		var moved = post("/api/applications/" + id + "/stage", userA, "{\"stage\":\"INTERVIEW\",\"fromStage\":\"CLOSED\"}");
		assertThat(moved.statusCode()).as(moved.body()).isEqualTo(200);
		assertThat(get("/api/applications/" + id, userA).body()).contains("\"closeReason\":null");

		assertThat(appliedBefore(userA, "Acme", "")).contains("\"id\":\"" + id + "\"");

		delete("/api/applications/" + id, userA);
		assertThat(appliedBefore(userA, "Acme", "")).contains("\"items\":[]");
	}

}
