package com.coreex.tokens;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestSupportConfiguration.TestClock;

/** A request that gets through authentication reaches the test probe at /mcp (200); refusals are 401, 403 or 429. */
@TestPropertySource(properties = "coreex.tokens.calls-per-minute=5")
class McpTokenAuthTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestClock clock;

	private UUID userId;

	private String jwt;

	@BeforeEach
	void cleanDatabase() {
		jdbc.sql("delete from users").update();
		userId = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'a@example.com', 'USER')").param("id", userId)
				.update();
		jwt = TestJwts.tokenFor(userId, "a@example.com");
	}

	private String newToken() throws Exception {
		var body = post("/api/access-tokens", jwt, "{\"name\":\"agent\"}").body();
		var matcher = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(body);
		assertThat(matcher.find()).as(body).isTrue();
		return matcher.group(1);
	}

	private HttpResponse<String> mcp(String bearer) throws Exception {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/mcp"));
		if (bearer != null) {
			request.header("Authorization", "Bearer " + bearer);
		}
		return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

	private boolean hasBeenUsed() {
		return jdbc.sql("select last_used_at is not null from access_tokens").query(Boolean.class).single();
	}

	private OffsetDateTime lastUsedAt() {
		return jdbc.sql("select last_used_at from access_tokens").query(OffsetDateTime.class).single();
	}

	@Test
	void aLiveTokenGetsThroughAuthentication() throws Exception {
		assertThat(mcp(newToken()).statusCode()).isEqualTo(200);
	}

	@Test
	void noTokenAnUnknownTokenOrASupabaseJwtIsRefused() throws Exception {
		assertThat(mcp(null).statusCode()).isEqualTo(401);
		assertThat(mcp("cx_pat_unknown").statusCode()).isEqualTo(401);
		assertThat(mcp(jwt).statusCode()).isEqualTo(401);
	}

	@Test
	void anExpiredTokenIsRefused() throws Exception {
		var token = newToken();

		clock.advance(Duration.ofDays(91));

		assertThat(mcp(token).statusCode()).isEqualTo(401);
	}

	@Test
	void aRevokedTokenIsRefused() throws Exception {
		var token = newToken();
		jdbc.sql("update access_tokens set revoked_at = now()").update();

		assertThat(mcp(token).statusCode()).isEqualTo(401);
	}

	@Test
	void aDisabledUsersTokenIsRefused() throws Exception {
		var token = newToken();
		jdbc.sql("update users set status = 'DISABLED' where id = :id").param("id", userId).update();

		var response = mcp(token);

		assertThat(response.statusCode()).isEqualTo(403);
		assertThat(response.body()).contains("\"code\":\"USER_DISABLED\"");
	}

	@Test
	void aTokenIsRefusedOutsideMcp() throws Exception {
		var token = newToken();

		assertThat(get("/api/me", token).statusCode()).isEqualTo(401);
		assertThat(get("/api/access-tokens", token).statusCode()).isEqualTo(401);
	}

	@Test
	void useUpdatesLastUsed() throws Exception {
		var token = newToken();
		assertThat(hasBeenUsed()).isFalse();

		mcp(token);

		assertThat(hasBeenUsed()).isTrue();
	}

	@Test
	void aBusyTokenRewritesLastUsedAtMostOncePerMinute() throws Exception {
		var token = newToken();
		mcp(token);
		var first = lastUsedAt();

		clock.advance(Duration.ofSeconds(30));
		mcp(token);
		assertThat(lastUsedAt()).isEqualTo(first);

		clock.advance(Duration.ofSeconds(31));
		mcp(token);
		assertThat(lastUsedAt()).isAfter(first);
	}

	@Test
	void tooManyCallsInAMinuteAreRefusedUntilTheNextMinute() throws Exception {
		var token = newToken();
		for (int i = 0; i < 5; i++) {
			assertThat(mcp(token).statusCode()).isEqualTo(200);
		}

		var limited = mcp(token);

		assertThat(limited.statusCode()).isEqualTo(429);
		assertThat(limited.body()).contains("\"code\":\"RATE_LIMITED\"");
		assertThat(limited.headers().firstValue("Retry-After")).isPresent();
		clock.advance(Duration.ofSeconds(61));
		assertThat(mcp(token).statusCode()).isEqualTo(200);
	}

}
