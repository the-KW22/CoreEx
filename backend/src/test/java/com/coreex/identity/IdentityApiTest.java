package com.coreex.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestSupportConfiguration.TestClock;

class IdentityApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestClock clock;

	@MockitoSpyBean
	UserRepository userRepository;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		jdbc.sql("delete from invites").update();
	}

	private void invite(String email, String status) {
		jdbc.sql("insert into invites (email, status) values (:email, :status)").param("email", email)
				.param("status", status).update();
	}

	private String inviteStatus(String email) {
		return jdbc.sql("select status from invites where email = :email").param("email", email)
				.query(String.class).single();
	}

	private void user(UUID id, String email, String role, String status) {
		jdbc.sql("insert into users (id, email, role, status) values (:id, :email, :role, :status)")
				.param("id", id).param("email", email).param("role", role).param("status", status).update();
	}

	private Instant lastActiveOf(UUID id) {
		return jdbc.sql("select last_active_at from users where id = :id").param("id", id)
				.query((rs, n) -> rs.getTimestamp(1).toInstant()).single();
	}

	@Test
	void ownerEmailSignsInAsAdminWithoutAnInvite() throws Exception {
		var response = get("/api/me", TestJwts.tokenFor(UUID.randomUUID(), "owner@example.com"));

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("\"role\":\"ADMIN\"").contains("\"email\":\"owner@example.com\"");
	}

	@Test
	void pendingInviteBecomesAUserAndTheInviteIsAccepted() throws Exception {
		invite("friend@example.com", "PENDING");

		var response = get("/api/me", TestJwts.tokenFor(UUID.randomUUID(), "Friend@Example.com"));

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("\"role\":\"USER\"");
		assertThat(inviteStatus("friend@example.com")).isEqualTo("ACCEPTED");
	}

	@Test
	void ifAnotherRequestProvisionsTheSameFirstTimeUserAtTheSameMomentThisOneStillSignsIn() throws Exception {
		invite("friend@example.com", "PENDING");
		var id = UUID.randomUUID();
		// The other request wins: by the time this one tries to accept the Invite, the User exists and the Invite is used.
		doAnswer(call -> {
			user(id, "friend@example.com", "USER", "ACTIVE");
			jdbc.sql("update invites set status = 'ACCEPTED' where email = 'friend@example.com'").update();
			return false;
		}).when(userRepository).acceptPendingInvite(any(), any());

		var response = get("/api/me", TestJwts.tokenFor(id, "friend@example.com"));

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
	}

	@Test
	void signingInAgainKeepsTheSameUser() throws Exception {
		invite("friend@example.com", "PENDING");
		var token = TestJwts.tokenFor(UUID.randomUUID(), "friend@example.com");

		get("/api/me", token);
		var second = get("/api/me", token);

		assertThat(second.statusCode()).isEqualTo(200);
		assertThat(jdbc.sql("select count(*) from users").query(Long.class).single()).isEqualTo(1);
	}

	@Test
	void personWithoutAnInviteGetsNotInvited() throws Exception {
		var response = get("/api/me", TestJwts.tokenFor(UUID.randomUUID(), "stranger@example.com"));

		assertThat(response.statusCode()).isEqualTo(403);
		assertThat(response.body()).contains("\"code\":\"NOT_INVITED\"");
		assertThat(jdbc.sql("select count(*) from users").query(Long.class).single()).isZero();
	}

	@Test
	void revokedInviteGetsNotInvited() throws Exception {
		invite("friend@example.com", "REVOKED");

		var response = get("/api/me", TestJwts.tokenFor(UUID.randomUUID(), "friend@example.com"));

		assertThat(response.statusCode()).isEqualTo(403);
		assertThat(response.body()).contains("\"code\":\"NOT_INVITED\"");
	}

	@Test
	void disabledUserGetsUserDisabled() throws Exception {
		var id = UUID.randomUUID();
		user(id, "gone@example.com", "USER", "DISABLED");

		var response = get("/api/me", TestJwts.tokenFor(id, "gone@example.com"));

		assertThat(response.statusCode()).isEqualTo(403);
		assertThat(response.body()).contains("\"code\":\"USER_DISABLED\"");
	}

	@Test
	void requestsWithoutAValidTokenGet401() throws Exception {
		var id = UUID.randomUUID();

		assertThat(get("/api/me").statusCode()).isEqualTo(401);
		assertThat(get("/api/me", "not-a-token").statusCode()).isEqualTo(401);
		assertThat(get("/api/me", TestJwts.expiredTokenFor(id, "owner@example.com")).statusCode()).isEqualTo(401);
		assertThat(get("/api/me", TestJwts.tokenSignedByStranger(id, "owner@example.com")).statusCode())
				.isEqualTo(401);
	}

	@Test
	void lastActiveIsUpdatedAtMostOnceEveryFiveMinutes() throws Exception {
		var id = UUID.randomUUID();
		var token = TestJwts.tokenFor(id, "owner@example.com");
		HttpResponse<String> signIn = get("/api/me", token);
		assertThat(signIn.statusCode()).isEqualTo(200);
		Instant first = lastActiveOf(id);

		clock.advance(Duration.ofMinutes(2));
		get("/api/me", token);
		assertThat(lastActiveOf(id)).isEqualTo(first);

		clock.advance(Duration.ofMinutes(4));
		get("/api/me", token);
		assertThat(lastActiveOf(id)).isEqualTo(first.plus(Duration.ofMinutes(6)));
	}

}
