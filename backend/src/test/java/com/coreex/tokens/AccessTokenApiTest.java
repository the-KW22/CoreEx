package com.coreex.tokens;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestSupportConfiguration.TestClock;

class AccessTokenApiTest extends ApiTest {

	private static final String TOKENS = "/api/access-tokens";

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestClock clock;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
	}

	private String userToken(String email) {
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", email).update();
		return TestJwts.tokenFor(id, email);
	}

	private static String field(String json, String name) {
		var matcher = Pattern.compile("\"" + name + "\":\"([^\"]+)\"").matcher(json);
		assertThat(matcher.find()).as(json).isTrue();
		return matcher.group(1);
	}

	private String create(String jwt, String name) throws Exception {
		return post(TOKENS, jwt, "{\"name\":\"" + name + "\"}").body();
	}

	@Test
	void theRawTokenIsShownOnceAndOnlyItsHashIsStored() throws Exception {
		var jwt = userToken("a@example.com");

		var created = post(TOKENS, jwt, "{\"name\":\"Claude Code laptop\"}");

		assertThat(created.statusCode()).isEqualTo(201);
		var raw = field(created.body(), "token");
		assertThat(raw).startsWith("cx_pat_");
		assertThat(jdbc.sql("select count(*) from access_tokens where token_hash = :raw").param("raw", raw)
				.query(Long.class).single()).isZero();
		var listed = get(TOKENS, jwt);
		assertThat(listed.statusCode()).isEqualTo(200);
		assertThat(listed.body()).contains("Claude Code laptop").doesNotContain(raw).doesNotContain("Hash");
	}

	@Test
	void aTokenExpiresAfterNinetyDaysUnlessToldOtherwise() throws Exception {
		var jwt = userToken("a@example.com");

		assertThat(create(jwt, "default")).contains("\"expiresAt\":\"");
		assertThat(post(TOKENS, jwt, "{\"name\":\"forever\",\"neverExpires\":true}").body())
				.contains("\"expiresAt\":null");
		assertThat(post(TOKENS, jwt, "{\"name\":\"short\",\"expiresInDays\":7}").statusCode()).isEqualTo(201);
	}

	@Test
	void anExpiredTokenIsListedAsExpired() throws Exception {
		var jwt = userToken("a@example.com");
		create(jwt, "old");
		assertThat(get(TOKENS, jwt).body()).contains("\"expired\":false");

		clock.advance(Duration.ofDays(91));

		assertThat(get(TOKENS, jwt).body()).contains("\"expired\":true");
	}

	@Test
	void aBlankNameIsRefused() throws Exception {
		var response = post(TOKENS, userToken("a@example.com"), "{\"name\":\"  \"}");

		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.body()).contains("\"code\":\"INVALID_REQUEST\"");
	}

	@Test
	void revokingRemovesTheTokenFromTheList() throws Exception {
		var jwt = userToken("a@example.com");
		var id = field(create(jwt, "gone"), "id");

		assertThat(delete(TOKENS + "/" + id, jwt).statusCode()).isEqualTo(204);

		assertThat(get(TOKENS, jwt).body()).doesNotContain("gone");
	}

	@Test
	void userBCannotSeeOrRevokeUserAsToken() throws Exception {
		var a = userToken("a@example.com");
		var b = userToken("b@example.com");
		var id = field(create(a, "mine"), "id");

		assertThat(get(TOKENS, b).body()).doesNotContain("mine");
		assertThat(delete(TOKENS + "/" + id, b).statusCode()).isEqualTo(404);
		assertThat(get(TOKENS, a).body()).contains("mine");
	}

	@Test
	void aUserCanHaveTenActiveTokensAndNoMore() throws Exception {
		var jwt = userToken("a@example.com");
		for (int i = 0; i < 10; i++) {
			assertThat(post(TOKENS, jwt, "{\"name\":\"t" + i + "\"}").statusCode()).isEqualTo(201);
		}

		var eleventh = post(TOKENS, jwt, "{\"name\":\"one too many\"}");

		assertThat(eleventh.statusCode()).isEqualTo(409);
		assertThat(eleventh.body()).contains("\"code\":\"TOKEN_LIMIT\"");
	}

}
