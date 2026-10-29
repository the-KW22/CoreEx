package com.coreex.identity;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;

/** Supabase Auth's admin API with the JDK HTTP client: {@code DELETE /admin/users/{id}} with the secret key. */
@Component
class SupabaseAuthAccounts implements AuthAccounts {

	private static final Logger log = LoggerFactory.getLogger(SupabaseAuthAccounts.class);

	private final AuthProperties properties;

	private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

	SupabaseAuthAccounts(AuthProperties properties) {
		this.properties = properties;
	}

	@Override
	public void delete(UUID id) {
		if (properties.url().isBlank() || properties.serviceKey().isBlank()) {
			throw unavailable("Auth admin is not configured");
		}
		// Both headers, as for Storage: a new-style "sb_secret_..." key is only accepted in apikey.
		var request = HttpRequest.newBuilder(URI.create(properties.url() + "/admin/users/" + id))
				.timeout(Duration.ofSeconds(10)).header("apikey", properties.serviceKey())
				.header("Authorization", "Bearer " + properties.serviceKey()).DELETE().build();
		try {
			var response = http.send(request, HttpResponse.BodyHandlers.discarding());
			// Already gone (404) is the goal reached; a bad key or an outage is not.
			if (response.statusCode() / 100 != 2 && response.statusCode() != 404) {
				throw unavailable("Auth answered HTTP " + response.statusCode() + " to a delete");
			}
		}
		catch (IOException e) {
			throw unavailable("Auth could not be reached: " + e.getClass().getSimpleName());
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw unavailable("Auth request was interrupted");
		}
	}

	private ApiException unavailable(String why) {
		log.warn(why);
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_UNAVAILABLE",
				"The sign-in service is not available right now. Removal is not finished: the person is disabled, so press Remove again in a moment.");
	}

}
