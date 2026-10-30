package com.coreex.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestSupportConfiguration.TestClock;

/** The identity check remembers a User for a short while (the other API tests run with the cache off). */
@TestPropertySource(properties = "coreex.identity.user-cache-ttl=30s")
class UserCacheApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestClock clock;

	@MockitoSpyBean
	UserRepository userRepository;

	private final UUID id = UUID.randomUUID();

	private final String token = TestJwts.tokenFor(id, "friend@example.com");

	private final String admin = TestJwts.tokenFor(UUID.randomUUID(), "owner@example.com");

	@BeforeEach
	void aSignedUpFriend() {
		jdbc.sql("delete from users").update();
		jdbc.sql("insert into users (id, email, role, status) values (:id, 'friend@example.com', 'USER', 'ACTIVE')")
				.param("id", id).update();
	}

	@Test
	void theSecondRequestDoesNotAskTheDatabaseAgain() throws Exception {
		assertThat(get("/api/me", token).statusCode()).isEqualTo(200);
		assertThat(get("/api/me", token).statusCode()).isEqualTo(200);

		verify(userRepository, times(1)).findById(id);
	}

	@Test
	void anAdminDisablingTheUserTakesEffectOnTheVeryNextRequest() throws Exception {
		get("/api/me", token);
		get("/api/me", admin);

		assertThat(post("/api/admin/users/" + id + "/disable", admin, "{}").statusCode()).isEqualTo(200);

		var refused = get("/api/me", token);
		assertThat(refused.statusCode()).isEqualTo(403);
		assertThat(refused.body()).contains("\"code\":\"USER_DISABLED\"");
	}

	@Test
	void aChangeNobodyToldTheCacheAboutIsSeenOnceTheTimeIsUp() throws Exception {
		get("/api/me", token);
		jdbc.sql("update users set status = 'DISABLED' where id = :id").param("id", id).update();

		assertThat(get("/api/me", token).statusCode()).isEqualTo(200);

		clock.advance(Duration.ofSeconds(31));
		assertThat(get("/api/me", token).statusCode()).isEqualTo(403);
	}

}
