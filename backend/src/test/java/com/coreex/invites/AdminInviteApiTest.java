package com.coreex.invites;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

class AdminInviteApiTest extends ApiTest {

	private static final String INVITES = "/api/admin/invites";

	@Autowired
	JdbcClient jdbc;

	private final String admin = TestJwts.tokenFor(UUID.randomUUID(), "owner@example.com");

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		jdbc.sql("delete from invites").update();
	}

	private String createInvite(String email) throws Exception {
		return post(INVITES, admin, "{\"email\":\"" + email + "\"}").body();
	}

	private String idOf(String inviteJson) {
		var matcher = Pattern.compile("\"id\":\"([0-9a-f-]{36})\"").matcher(inviteJson);
		assertThat(matcher.find()).as(inviteJson).isTrue();
		return matcher.group(1);
	}

	private String userToken(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	@Test
	void adminCreatesListsAndRevokesInvites() throws Exception {
		HttpResponse<String> created = post(INVITES, admin, "{\"email\":\"  New@Example.com \"}");

		assertThat(created.statusCode()).isEqualTo(201);
		assertThat(created.body()).contains("\"email\":\"new@example.com\"").contains("\"status\":\"PENDING\"");

		var listed = get(INVITES, admin);
		assertThat(listed.statusCode()).isEqualTo(200);
		assertThat(listed.body()).contains("\"total\":1").contains("new@example.com");

		var revoked = post(INVITES + "/" + idOf(created.body()) + "/revoke", admin, null);
		assertThat(revoked.statusCode()).isEqualTo(200);
		assertThat(revoked.body()).contains("\"status\":\"REVOKED\"");
		assertThat(get(INVITES, admin).body()).contains("REVOKED");
	}

	@Test
	void emailsAreMatchedCaseInsensitively() throws Exception {
		createInvite("Friend@Example.com");

		var again = post(INVITES, admin, "{\"email\":\"friend@EXAMPLE.com\"}");

		assertThat(again.statusCode()).isEqualTo(409);
		assertThat(again.body()).contains("\"code\":\"INVITE_EXISTS\"");
	}

	@Test
	void inviteForAnEmailThatAlreadyHasAUserIsRefused() throws Exception {
		userToken("member@example.com");

		var response = post(INVITES, admin, "{\"email\":\"Member@example.com\"}");

		assertThat(response.statusCode()).isEqualTo(409);
		assertThat(response.body()).contains("\"code\":\"USER_EXISTS\"");
	}

	@Test
	void anEmailCanBeInvitedAgainAfterItsInviteWasRevoked() throws Exception {
		var first = createInvite("friend@example.com");
		post(INVITES + "/" + idOf(first) + "/revoke", admin, null);

		var again = post(INVITES, admin, "{\"email\":\"friend@example.com\"}");

		assertThat(again.statusCode()).isEqualTo(201);
	}

	@Test
	void aCreatedInviteLetsThatPersonSignUp() throws Exception {
		createInvite("friend@example.com");

		var signIn = get("/api/me", TestJwts.tokenFor(UUID.randomUUID(), "Friend@example.com"));

		assertThat(signIn.statusCode()).isEqualTo(200);
		assertThat(signIn.body()).contains("\"role\":\"USER\"");
	}

	@Test
	void aRevokedInviteNoLongerLetsThatPersonSignUp() throws Exception {
		var invite = createInvite("friend@example.com");
		post(INVITES + "/" + idOf(invite) + "/revoke", admin, null);

		var signIn = get("/api/me", TestJwts.tokenFor(UUID.randomUUID(), "friend@example.com"));

		assertThat(signIn.statusCode()).isEqualTo(403);
		assertThat(signIn.body()).contains("\"code\":\"NOT_INVITED\"");
	}

	@Test
	void nonAdminUsersGet403OnEveryAdminEndpoint() throws Exception {
		var user = userToken("member@example.com");
		var someId = UUID.randomUUID();

		for (var response : new HttpResponse<?>[] { get(INVITES, user),
				post(INVITES, user, "{\"email\":\"x@example.com\"}"),
				post(INVITES + "/" + someId + "/revoke", user, null) }) {
			assertThat(response.statusCode()).isEqualTo(403);
			assertThat(response.body().toString()).contains("\"code\":\"FORBIDDEN\"");
		}
		assertThat(jdbc.sql("select count(*) from invites").query(Long.class).single()).isZero();
	}

	@Test
	void adminEndpointsNeedAToken() throws Exception {
		assertThat(get(INVITES).statusCode()).isEqualTo(401);
		assertThat(post(INVITES, null, "{\"email\":\"x@example.com\"}").statusCode()).isEqualTo(401);
	}

	@Test
	void aBadEmailIsRejected() throws Exception {
		for (var body : new String[] { "{\"email\":\"not-an-email\"}", "{\"email\":\"\"}", "{}", "nonsense" }) {
			var response = post(INVITES, admin, body);

			assertThat(response.statusCode()).as(body).isEqualTo(400);
			assertThat(response.body()).contains("\"code\":\"INVALID_REQUEST\"");
		}
	}

	@Test
	void revokingAnUnknownInviteIs404AndANonPendingOneIs409() throws Exception {
		var unknown = post(INVITES + "/" + UUID.randomUUID() + "/revoke", admin, null);
		assertThat(unknown.statusCode()).isEqualTo(404);
		assertThat(unknown.body()).contains("\"code\":\"NOT_FOUND\"");

		var id = idOf(createInvite("friend@example.com"));
		post(INVITES + "/" + id + "/revoke", admin, null);
		var twice = post(INVITES + "/" + id + "/revoke", admin, null);
		assertThat(twice.statusCode()).isEqualTo(409);
		assertThat(twice.body()).contains("\"code\":\"INVITE_NOT_PENDING\"");
	}

	@Test
	void listIsPagedNewestFirst() throws Exception {
		createInvite("a@example.com");
		createInvite("b@example.com");
		createInvite("c@example.com");

		var firstPage = get(INVITES + "?page=0&size=2", admin).body();
		var secondPage = get(INVITES + "?page=1&size=2", admin).body();

		assertThat(get(INVITES + "?page=2147483647&size=100", admin).statusCode()).isEqualTo(200);
		assertThat(firstPage).contains("\"total\":3").contains("c@example.com").contains("b@example.com")
				.doesNotContain("a@example.com");
		assertThat(secondPage).contains("\"total\":3").contains("a@example.com").doesNotContain("c@example.com");
	}

}
