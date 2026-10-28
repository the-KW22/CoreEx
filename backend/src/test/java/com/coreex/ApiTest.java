package com.coreex;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

/** Base for API tests: the real app on a random port, Testcontainers Postgres, test JWTs. */
@Import({ TestcontainersConfiguration.class, TestSupportConfiguration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
		"coreex.identity.owner-email=Owner@Example.com",
		"spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://unused.invalid/jwks",
		"spring.security.oauth2.resourceserver.jwt.issuer-uri=http://unused.invalid" })
public abstract class ApiTest {

	@LocalServerPort
	int port;

	protected HttpResponse<String> get(String path) throws IOException, InterruptedException {
		return get(path, null);
	}

	protected HttpResponse<String> get(String path, String token) throws IOException, InterruptedException {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
		if (token != null) {
			request.header("Authorization", "Bearer " + token);
		}
		return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

}
