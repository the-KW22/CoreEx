package com.coreex.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;

import com.coreex.ApiTest;

class CorsApiTest extends ApiTest {

	private HttpResponse<String> preflight(String origin) throws Exception {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/me"))
				.method("OPTIONS", HttpRequest.BodyPublishers.noBody()).header("Origin", origin)
				.header("Access-Control-Request-Method", "GET").header("Access-Control-Request-Headers", "authorization")
				.build();
		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	@Test
	void theConfiguredFrontendOriginMayCallTheApi() throws Exception {
		var response = preflight("https://app.example.com");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).hasValue("https://app.example.com");
	}

	@Test
	void anyOtherOriginIsRefused() throws Exception {
		var response = preflight("https://evil.example.com");

		assertThat(response.statusCode()).isEqualTo(403);
		assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
	}

}
