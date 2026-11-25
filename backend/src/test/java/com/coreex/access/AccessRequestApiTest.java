package com.coreex.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;

// Small limits, so the rate limits can be reached in a test.
@TestPropertySource(properties = { "coreex.access-requests.per-ip-per-hour=3", "coreex.access-requests.per-day=6" })
class AccessRequestApiTest extends ApiTest {

	private static final String PATH = "/api/access-requests";

	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		jdbc.sql("delete from access_request").update();
	}

	// Each test asks from its own address, so one test's requests never count against another's.
	private String address() {
		return "203.0.113." + Math.abs(UUID.randomUUID().hashCode() % 250);
	}

	private int rows() {
		return jdbc.sql("select count(*) from access_request").query(Integer.class).single();
	}

	private String body(String email) {
		return "{\"email\":\"" + email + "\"}";
	}

	@Test
	void aSignedOutVisitorCanAskForAnInvite() throws Exception {
		var response = post(PATH, null, body("  New@Example.com "), "X-Visitor-IP", address());

		assertThat(response.statusCode()).isEqualTo(202);
		assertThat(response.body()).isEmpty();
		assertThat(jdbc.sql("select email || ' ' || status from access_request").query(String.class).single())
				.isEqualTo("new@example.com OPEN");
	}

	@Test
	void aRepeatedEmailGetsTheSameAnswerAndOneRow() throws Exception {
		var visitor = address();
		var first = post(PATH, null, body("again@example.com"), "X-Visitor-IP", visitor);
		var second = post(PATH, null, body("AGAIN@example.com"), "X-Visitor-IP", visitor);

		assertThat(second.statusCode()).isEqualTo(first.statusCode()).isEqualTo(202);
		assertThat(second.body()).isEqualTo(first.body());
		assertThat(rows()).isEqualTo(1);
	}

	@Test
	void anEmailThatAlreadyHasAnAccountGetsTheSameAnswerAndNoRow() throws Exception {
		jdbc.sql("insert into users (id, email, role) values (:id, 'member@example.com', 'USER')")
				.param("id", UUID.randomUUID()).update();

		var response = post(PATH, null, body("member@example.com"), "X-Visitor-IP", address());

		assertThat(response.statusCode()).isEqualTo(202);
		assertThat(response.body()).isEmpty();
		assertThat(rows()).isZero();
	}

	@Test
	void anInvalidEmailIsRefusedWithAClearMessage() throws Exception {
		var response = post(PATH, null, body("not-an-email"), "X-Visitor-IP", address());

		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.body()).contains("INVALID_REQUEST").contains("Enter a valid email address.");
		assertThat(rows()).isZero();
	}

	@Test
	void aMissingEmailIsRefused() throws Exception {
		var response = post(PATH, null, "{}", "X-Visitor-IP", address());

		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.body()).contains("INVALID_REQUEST");
	}

	@Test
	void oneAddressIsLimitedAndAnotherIsNot() throws Exception {
		var busy = address();
		for (var i = 0; i < 3; i++) {
			assertThat(post(PATH, null, body("a" + i + "@example.com"), "X-Visitor-IP", busy).statusCode()).isEqualTo(202);
		}
		var limited = post(PATH, null, body("a4@example.com"), "X-Visitor-IP", busy);

		assertThat(limited.statusCode()).isEqualTo(429);
		assertThat(limited.body()).contains("RATE_LIMITED");
		assertThat(post(PATH, null, body("other@example.com"), "X-Visitor-IP", address() + "9").statusCode())
				.isEqualTo(202);
	}

	@Test
	void theDailyCapStopsRequestsFromEveryAddress() throws Exception {
		for (var i = 0; i < 6; i++) {
			assertThat(post(PATH, null, body("day" + i + "@example.com"), "X-Visitor-IP", address() + i).statusCode())
					.isEqualTo(202);
		}
		var capped = post(PATH, null, body("late@example.com"), "X-Visitor-IP", address() + "x");

		assertThat(capped.statusCode()).isEqualTo(429);
		assertThat(capped.body()).contains("RATE_LIMITED");
		assertThat(rows()).isEqualTo(6);
	}

	@Test
	void nothingElseCanBeReadWithoutSigningIn() throws Exception {
		assertThat(get(PATH).statusCode()).isIn(401, 405);
		assertThat(get("/api/admin/access-requests").statusCode()).isEqualTo(401);
	}

}
