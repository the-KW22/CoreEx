package com.coreex.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import com.coreex.TestcontainersConfiguration;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthApiTest {

	@LocalServerPort
	int port;

	private HttpResponse<String> get(String path) throws IOException, InterruptedException {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).build();
		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	@Test
	void healthEndpointIsPublicAndReportsUp() throws Exception {
		var response = get("/api/health");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("\"status\":\"UP\"");
	}

	@Test
	void openApiSpecDescribesTheHealthEndpoint() throws Exception {
		var response = get("/v3/api-docs");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("/api/health");
	}

	// The frontend client is generated from this file; CI fails if it is stale (issue #2).
	// shortcut: rewrites the committed spec on every test run, move to a Maven plugin when specs get large.
	@Test
	void publishedSpecIsWrittenForClientGeneration() throws Exception {
		var spec = get("/v3/api-docs").body();

		Files.writeString(Path.of("openapi.json"), spec + "\n");
	}

}
