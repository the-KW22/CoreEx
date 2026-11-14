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

class ApplicationApiTest extends ApiTest {

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

	private String create(String token, String json) throws Exception {
		var created = post("/api/applications", token, json);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		return created.body();
	}

	private String saveFields(String token, String id, String title, String company, String role, int version)
			throws Exception {
		var saved = put("/api/applications/" + id, token, "{\"title\":\"" + title + "\",\"company\":\"" + company
				+ "\",\"role\":\"" + role + "\",\"location\":\"\",\"postingUrl\":\"\",\"postingText\":\"\",\"version\":"
				+ version + "}");
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		return saved.body();
	}

	private String move(String token, String id, String stage, int version) throws Exception {
		var moved = post("/api/applications/" + id + "/stage", token,
				"{\"stage\":\"" + stage + "\",\"version\":" + version + "}");
		assertThat(moved.statusCode()).as(moved.body()).isEqualTo(200);
		return moved.body();
	}

	@Test
	void anApplicationCreatedFromPastedTextIsTitledRoleAtCompanyAndStartsSaved() throws Exception {
		var body = create(userA, "{\"company\":\"Acme\",\"role\":\"Engineer\",\"postingText\":\"We hire.\"}");

		assertThat(field(body, "title")).isEqualTo("Engineer at Acme");
		assertThat(field(body, "stage")).isEqualTo("SAVED");
		assertThat(body).contains("\"postingText\":\"We hire.\"").contains("\"timeline\":[{\"type\":\"STAGE\"");
		assertThat(field(body, "appliedOn")).isEqualTo("null");
	}

	@Test
	void anApplicationAppearsInTheItemListAndTheApplicationList() throws Exception {
		var id = field(create(userA, "{\"company\":\"Acme\",\"role\":\"Engineer\"}"), "id");

		var applications = get("/api/applications", userA).body();
		assertThat(applications).contains(id).contains("\"total\":1");
		assertThat(get("/api/items", userA).body()).contains(id).contains("\"type\":\"APPLICATION\"");
	}

	@Test
	void renamingStopsTheAutomaticTitleButEditingCompanyBeforeThatFollowsIt() throws Exception {
		var made = create(userA, "{\"company\":\"Acme\",\"role\":\"Engineer\"}");
		var id = field(made, "id");

		// The title sent back unchanged is not a rename: the automatic title follows the new company.
		var followed = saveFields(userA, id, "Engineer at Acme", "Beta", "Engineer", 1);
		assertThat(field(followed, "title")).isEqualTo("Engineer at Beta");

		var renamed = saveFields(userA, id, "My favourite", "Beta", "Engineer", 2);
		assertThat(field(renamed, "title")).isEqualTo("My favourite");

		var after = saveFields(userA, id, "My favourite", "Gamma", "Designer", 3);
		assertThat(field(after, "title")).isEqualTo("My favourite");
		assertThat(field(after, "company")).isEqualTo("Gamma");
	}

	@Test
	void movingStageAppendsATimelineEntryAndTheFirstMoveIntoAppliedSetsTheAppliedDateOnce() throws Exception {
		var made = create(userA, "{\"company\":\"Acme\",\"role\":\"Engineer\"}");
		var id = field(made, "id");

		var applied = move(userA, id, "APPLIED", 1);
		assertThat(field(applied, "stage")).isEqualTo("APPLIED");
		var firstDate = field(applied, "appliedOn");
		assertThat(firstDate).endsWith("T12:00:00Z");
		assertThat(applied.split("\"type\":\"STAGE\"", -1)).hasSize(3); // Saved, then Applied

		move(userA, id, "SCREENING", 2);
		move(userA, id, "SAVED", 3);
		var again = move(userA, id, "APPLIED", 4);
		assertThat(field(again, "appliedOn")).isEqualTo(firstDate);
		assertThat(again).contains("\"seq\":5"); // the write sequence only goes up
	}

	@Test
	void aStageThatDoesNotExistIsRefused() throws Exception {
		var id = field(create(userA, "{\"company\":\"Acme\",\"role\":\"Engineer\"}"), "id");

		var refused = post("/api/applications/" + id + "/stage", userA, "{\"stage\":\"DREAMING\",\"version\":1}");

		assertThat(refused.statusCode()).isEqualTo(400);
	}

	@Test
	void aSaveFromAnOldVersionIsRefusedWithAConflict() throws Exception {
		var id = field(create(userA, "{\"company\":\"Acme\",\"role\":\"Engineer\"}"), "id");
		saveFields(userA, id, "Engineer at Acme", "Beta", "Engineer", 1);

		var stale = put("/api/applications/" + id, userA, "{\"title\":\"x\",\"company\":\"c\",\"role\":\"r\","
				+ "\"location\":\"\",\"postingUrl\":\"\",\"postingText\":\"\",\"version\":1}");
		assertThat(stale.statusCode()).isEqualTo(409);
		assertThat(stale.body()).contains("VERSION_CONFLICT");

		var staleMove = post("/api/applications/" + id + "/stage", userA, "{\"stage\":\"APPLIED\",\"version\":1}");
		assertThat(staleMove.statusCode()).isEqualTo(409);
	}

	@Test
	void anotherUserGets404OnEveryEndpoint() throws Exception {
		var id = field(create(userA, "{\"company\":\"Acme\",\"role\":\"Engineer\"}"), "id");

		assertThat(get("/api/applications/" + id, userB).statusCode()).isEqualTo(404);
		assertThat(put("/api/applications/" + id, userB, "{\"title\":\"x\",\"company\":\"c\",\"role\":\"r\","
				+ "\"location\":\"\",\"postingUrl\":\"\",\"postingText\":\"\",\"version\":1}").statusCode())
				.isEqualTo(404);
		assertThat(post("/api/applications/" + id + "/stage", userB, "{\"stage\":\"APPLIED\",\"version\":1}")
				.statusCode()).isEqualTo(404);
		assertThat(get("/api/applications", userB).body()).doesNotContain(id).contains("\"total\":0");
		assertThat(get("/api/applications/" + id, userA).statusCode()).isEqualTo(200);
	}

	@Test
	void anApplicationNeedsACompanyAndARole() throws Exception {
		assertThat(post("/api/applications", userA, "{\"company\":\"\",\"role\":\"Engineer\"}").statusCode())
				.isEqualTo(400);
		assertThat(post("/api/applications", userA, "{\"company\":\"Acme\",\"role\":\" \"}").statusCode())
				.isEqualTo(400);
	}

}
