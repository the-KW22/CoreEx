package com.coreex.trash;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestSupportConfiguration.TestClock;

/** The purge trigger that a scheduler outside the backend calls, protected by a shared token. */
@TestPropertySource(properties = "coreex.trash.purge-token=purge-secret")
class TrashPurgeEndpointTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TestClock clock;

	private String user;

	private String noteId;

	@BeforeEach
	void trashedNoteOlderThanTheRetention() throws Exception {
		jdbc.sql("delete from users").update();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, 'a@example.com', 'USER')").param("id", id).update();
		user = TestJwts.tokenFor(id, "a@example.com");
		var created = post("/api/notes", user, "{\"title\":\"Old\"}");
		noteId = created.body().replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
		assertThat(delete("/api/notes/" + noteId, user).statusCode()).isEqualTo(204);
		clock.advance(Duration.ofDays(31));
	}

	private HttpResponse<String> purge(String tokenHeader, String bearer) throws Exception {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/internal/trash/purge"))
				.POST(HttpRequest.BodyPublishers.noBody());
		if (tokenHeader != null) {
			request.header("X-Purge-Token", tokenHeader);
		}
		if (bearer != null) {
			request.header("Authorization", "Bearer " + bearer);
		}
		return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

	private boolean noteRowExists() {
		return jdbc.sql("select exists (select 1 from items where id = :id)").param("id", UUID.fromString(noteId))
				.query(Boolean.class).single();
	}

	@Test
	void theRightTokenPurgesWhatIsOlderThanTheRetentionAndSaysHowMany() throws Exception {
		var response = purge("purge-secret", null);

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("\"removed\":1");
		assertThat(noteRowExists()).isFalse();
	}

	@Test
	void aMissingOrWrongTokenIsRefusedAndNothingIsPurged() throws Exception {
		assertThat(purge(null, null).statusCode()).isEqualTo(401);
		assertThat(purge("", null).statusCode()).isEqualTo(401);
		assertThat(purge("purge-secre", null).statusCode()).isEqualTo(401);
		assertThat(purge("purge-secret-and-more", null).statusCode()).isEqualTo(401);
		// A signed-in User's own token is not the purge token.
		assertThat(purge(null, user).statusCode()).isEqualTo(401);
		assertThat(noteRowExists()).isTrue();
	}

}
