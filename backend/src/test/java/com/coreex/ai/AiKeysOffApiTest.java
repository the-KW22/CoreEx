package com.coreex.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.json.JsonMapper;

/** With no vault secret on the server, Users cannot store keys, and the preferences say so. */
@TestPropertySource(properties = { "coreex.ai.provider=fake", "coreex.ai.key-secret=" })
class AiKeysOffApiTest extends ApiTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	JdbcClient jdbc;

	private String user;

	@BeforeEach
	void setUp() {
		jdbc.sql("delete from users").update();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'k@example.com', 'USER')").param("id", id).update();
		user = TestJwts.tokenFor(id, "k@example.com");
	}

	@Test
	void keysAreRefusedWith503AndThePreferencesSayTheyAreOff() throws Exception {
		var refused = put("/api/ai/key", user, "{\"provider\":\"anthropic\",\"key\":\"sk-ant-test-1111\"}");

		assertThat(refused.statusCode()).isEqualTo(503);
		assertThat(refused.body()).contains("\"code\":\"KEYS_OFF\"");
		var prefs = JSON.readTree(get("/api/ai/preferences", user).body());
		assertThat(prefs.path("keysAvailable").asBoolean()).isFalse();
		assertThat(prefs.path("key").isNull()).isTrue();
	}

}
