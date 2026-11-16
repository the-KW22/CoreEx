package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

/** Reading a posting from a link, through the API: who may ask, and what is refused. */
class ApplicationLinkApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	private String user;

	@BeforeEach
	void clean() {
		jdbc.sql("delete from users").update();
		var id = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", id)
				.param("email", "a@example.com").update();
		user = TestJwts.tokenFor(id, "a@example.com");
	}

	private HttpResponse<String> read(String url) throws Exception {
		return post("/api/applications/read-link", user, "{\"url\":\"" + url + "\"}");
	}

	@Test
	void anInternalAddressIsRefusedBeforeAnythingIsFetched() throws Exception {
		for (var url : new String[] { "http://localhost/jobs", "http://127.0.0.1:8080/", "http://[::1]/",
				"http://10.0.0.5/x", "http://169.254.169.254/latest/meta-data", "http://192.168.0.1/" }) {
			var response = read(url);
			assertThat(response.statusCode()).as(url).isEqualTo(400);
			assertThat(response.body()).as(url).contains("not a public address");
		}
	}

	@Test
	void aLinkThatIsNotAWebAddressOrHasACredentialOrCannotBeFoundIsRefused() throws Exception {
		assertThat(read("ftp://example.com/x").body()).contains("http and https");
		assertThat(read("example.com/jobs").body()).contains("http and https");
		assertThat(read("http://user:pass@example.com/").body()).contains("user name or password");
		assertThat(read("http://no-such-host.invalid/").body()).contains("could not be found");
		assertThat(post("/api/applications/read-link", user, "{\"url\":\"\"}").statusCode()).isEqualTo(400);
		assertThat(post("/api/applications/read-link", user, "{}").statusCode()).isEqualTo(400);
	}

	@Test
	void signingInIsRequired() throws Exception {
		var anonymous = HttpClient.newHttpClient().send(
				HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/applications/read-link"))
						.header("Content-Type", "application/json")
						.POST(HttpRequest.BodyPublishers.ofString("{\"url\":\"http://example.com/\"}")).build(),
				HttpResponse.BodyHandlers.ofString());

		assertThat(anonymous.statusCode()).isEqualTo(401);
	}

}
