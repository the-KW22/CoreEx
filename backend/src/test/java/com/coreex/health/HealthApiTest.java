package com.coreex.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import com.coreex.ApiTest;

class HealthApiTest extends ApiTest {

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
