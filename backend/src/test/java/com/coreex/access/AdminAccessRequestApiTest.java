package com.coreex.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class AdminAccessRequestApiTest extends ApiTest {

	private static final String PATH = "/api/admin/access-requests";

	@Autowired
	JdbcClient jdbc;

	private final String admin = TestJwts.tokenFor(UUID.randomUUID(), "owner@example.com");

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		jdbc.sql("delete from invites").update();
		jdbc.sql("delete from access_request").update();
	}

	/** Inserts a request created `minutesAgo` minutes ago and returns its id. */
	private UUID request(String email, int minutesAgo) {
		return jdbc.sql("insert into access_request (email, created_at) values (:email, now() - make_interval(mins => :ago)) returning id")
				.param("email", email).param("ago", minutesAgo).query(UUID.class).single();
	}

	private String status(UUID id) {
		return jdbc.sql("select status from access_request where id = :id").param("id", id).query(String.class).single();
	}

	private String memberToken() {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'member@example.com', 'USER')").param("id", id).update();
		return TestJwts.tokenFor(id, "member@example.com");
	}

	@Test
	void anAdminSeesOpenRequestsNewestFirstWithOnlyEmailAndDate() throws Exception {
		request("old@example.com", 30);
		request("new@example.com", 1);
		var dismissed = request("gone@example.com", 10);
		jdbc.sql("update access_request set status = 'DISMISSED' where id = :id").param("id", dismissed).update();

		var listed = get(PATH, admin);

		assertThat(listed.statusCode()).isEqualTo(200);
		assertThat(listed.body()).contains("\"total\":2");
		assertThat(listed.body().indexOf("new@example.com")).isPositive().isLessThan(listed.body().indexOf("old@example.com"));
		assertThat(listed.body()).doesNotContain("gone@example.com").contains("createdAt");
		assertThat(listed.body()).doesNotContain("status").doesNotContain("userId");
	}

	@Test
	void theListIsPaginated() throws Exception {
		for (var i = 0; i < 3; i++) {
			request("p" + i + "@example.com", i);
		}

		var second = get(PATH + "?page=1&size=2", admin);

		assertThat(second.body()).contains("\"total\":3").contains("p2@example.com").doesNotContain("p0@example.com");
	}

	@Test
	void inviteCreatesTheInviteAndClosesTheRequest() throws Exception {
		var id = request("friend@example.com", 5);

		var response = post(PATH + "/" + id + "/invite", admin, null);

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(status(id)).isEqualTo("INVITED");
		var invites = get("/api/admin/invites", admin);
		assertThat(invites.body()).contains("friend@example.com").contains("\"status\":\"PENDING\"");
		assertThat(get(PATH, admin).body()).contains("\"total\":0");
	}

	@Test
	void inviteStillClosesTheRequestWhenTheEmailAlreadyHasAPendingInvite() throws Exception {
		var id = request("twice@example.com", 5);
		assertThat(post("/api/admin/invites", admin, "{\"email\":\"twice@example.com\"}").statusCode()).isEqualTo(201);

		assertThat(post(PATH + "/" + id + "/invite", admin, null).statusCode()).isEqualTo(200);

		assertThat(status(id)).isEqualTo("INVITED");
	}

	@Test
	void dismissClosesTheRequestWithoutAnInvite() throws Exception {
		var id = request("nope@example.com", 5);

		assertThat(post(PATH + "/" + id + "/dismiss", admin, null).statusCode()).isEqualTo(200);

		assertThat(status(id)).isEqualTo("DISMISSED");
		assertThat(get("/api/admin/invites", admin).body()).doesNotContain("nope@example.com");
	}

	@Test
	void aClosedOrUnknownRequestCannotBeActedOnAgain() throws Exception {
		var id = request("once@example.com", 5);
		post(PATH + "/" + id + "/dismiss", admin, null);

		assertThat(post(PATH + "/" + id + "/invite", admin, null).statusCode()).isEqualTo(409);
		assertThat(post(PATH + "/" + id + "/dismiss", admin, null).statusCode()).isEqualTo(409);
		assertThat(post(PATH + "/" + UUID.randomUUID() + "/invite", admin, null).statusCode()).isEqualTo(404);
		assertThat(status(id)).isEqualTo("DISMISSED");
	}

	@Test
	void aNonAdminGets403OnEveryEndpoint() throws Exception {
		var id = request("secret@example.com", 5);
		var member = memberToken();

		assertThat(get(PATH, member).statusCode()).isEqualTo(403);
		assertThat(post(PATH + "/" + id + "/invite", member, null).statusCode()).isEqualTo(403);
		assertThat(post(PATH + "/" + id + "/dismiss", member, null).statusCode()).isEqualTo(403);
		assertThat(status(id)).isEqualTo("OPEN");
	}

	@Test
	void signedOutCallersAreRefused() throws Exception {
		assertThat(get(PATH).statusCode()).isEqualTo(401);
		assertThat(post(PATH + "/" + UUID.randomUUID() + "/invite", null, null).statusCode()).isEqualTo(401);
	}

}
