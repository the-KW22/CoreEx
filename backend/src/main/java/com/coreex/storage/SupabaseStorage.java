package com.coreex.storage;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;

import tools.jackson.databind.json.JsonMapper;

/**
 * Supabase Storage through its REST API with the JDK HTTP client: a signed upload URL for the browser to PUT to, an
 * authenticated HEAD for the real size, a signed download URL, and DELETE. The private bucket also enforces the 5 MB
 * maximum and the allowed types on its own side.
 */
@Component
class SupabaseStorage implements Storage {

	private static final Logger log = LoggerFactory.getLogger(SupabaseStorage.class);

	private static final Duration TIMEOUT = Duration.ofSeconds(10);

	private final StorageProperties properties;

	private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

	private final JsonMapper json = JsonMapper.builder().build();

	SupabaseStorage(StorageProperties properties) {
		this.properties = properties;
	}

	@Override
	public URI presignUpload(String key) {
		var response = send(post("/object/upload/sign/" + path(key), "{}"));
		return absolute(field(response, "url"));
	}

	@Override
	public URI presignDownload(String key, String downloadName, Duration ttl) {
		var response = send(post("/object/sign/" + path(key), "{\"expiresIn\":" + ttl.toSeconds() + "}"));
		var url = field(response, "signedURL");
		if (downloadName != null) {
			url += "&download=" + URLEncoder.encode(downloadName, StandardCharsets.UTF_8).replace("+", "%20");
		}
		return absolute(url);
	}

	@Override
	public Optional<StoredObject> head(String key) {
		var request = request("/object/authenticated/" + path(key)).method("HEAD", HttpRequest.BodyPublishers.noBody())
				.build();
		var response = sendRaw(request, HttpResponse.BodyHandlers.discarding());
		// A missing object answers 400 or 404 depending on the Storage version. Anything else (a bad key, an outage)
		// must not be mistaken for "not uploaded".
		if (response.statusCode() == 400 || response.statusCode() == 404) {
			return Optional.empty();
		}
		if (response.statusCode() != 200) {
			throw unavailable("Storage answered HTTP " + response.statusCode() + " to a size check");
		}
		var size = response.headers().firstValueAsLong("content-length").orElse(-1);
		var type = response.headers().firstValue("content-type").orElse("");
		return size < 0 ? Optional.empty() : Optional.of(new StoredObject(size, type));
	}

	@Override
	public void delete(String key) {
		var request = request("/object/" + path(key)).DELETE().build();
		var response = sendRaw(request, HttpResponse.BodyHandlers.discarding());
		// Already gone (400 or 404) is fine; a bad key or an outage is not, or the row would be dropped with the object kept.
		if (response.statusCode() != 200 && response.statusCode() != 400 && response.statusCode() != 404) {
			throw unavailable("Storage failed to delete an object (HTTP " + response.statusCode() + ")");
		}
	}

	private String path(String key) {
		return properties.bucket() + "/" + key;
	}

	private HttpRequest.Builder request(String path) {
		if (properties.url().isBlank() || properties.serviceKey().isBlank()) {
			throw unavailable("Storage is not configured");
		}
		// Both headers: a new-style "sb_secret_..." key is only accepted in apikey, a legacy service_role JWT works
		// in either, and sending both works for each.
		return HttpRequest.newBuilder(URI.create(properties.url() + path)).timeout(TIMEOUT)
				.header("apikey", properties.serviceKey()).header("Authorization", "Bearer " + properties.serviceKey());
	}

	private HttpRequest post(String path, String body) {
		return request(path).header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body))
				.build();
	}

	private String send(HttpRequest request) {
		var response = sendRaw(request, HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() / 100 != 2) {
			throw unavailable("Storage answered HTTP " + response.statusCode());
		}
		return response.body();
	}

	private <T> HttpResponse<T> sendRaw(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
		try {
			return http.send(request, handler);
		}
		catch (IOException e) {
			throw unavailable("Storage could not be reached: " + e.getClass().getSimpleName());
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw unavailable("Storage request was interrupted");
		}
	}

	private String field(String body, String name) {
		var value = json.readTree(body).path(name).asString("");
		if (value.isEmpty()) {
			throw unavailable("Storage answered without " + name);
		}
		return value;
	}

	// Storage answers paths relative to its own URL, such as "/object/sign/...?token=...".
	private URI absolute(String relative) {
		return URI.create(properties.url() + relative);
	}

	private ApiException unavailable(String why) {
		// The reason goes to the log only: it never names a key or a URL, and the client just sees "unavailable".
		log.warn(why);
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE",
				"File storage is not available right now. Try again in a moment.");
	}

}
