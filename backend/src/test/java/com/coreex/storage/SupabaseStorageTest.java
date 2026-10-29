package com.coreex.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.coreex.common.ApiException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/** The real Storage client against a tiny local HTTP server that answers like Supabase Storage did when spiked. */
class SupabaseStorageTest {

	private record Seen(String method, String path, String apikey, String authorization, String body) {
	}

	private HttpServer server;

	private final List<Seen> seen = new ArrayList<>();

	private int status = 200;

	private String answer = "{}";

	private String contentType = "image/png";

	private SupabaseStorage storage;

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", this::handle);
		server.start();
		storage = storageAt("http://127.0.0.1:" + server.getAddress().getPort() + "/storage/v1", "sb_secret_test");
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private static SupabaseStorage storageAt(String url, String key) {
		return new SupabaseStorage(new StorageProperties(url, key, "assets"));
	}

	private void handle(HttpExchange exchange) throws IOException {
		var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
		seen.add(new Seen(exchange.getRequestMethod(), exchange.getRequestURI().getPath(),
				exchange.getRequestHeaders().getFirst("apikey"), exchange.getRequestHeaders().getFirst("Authorization"),
				body));
		var bytes = answer.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().add("Content-Type", contentType);
		if (exchange.getRequestMethod().equals("HEAD")) {
			exchange.getResponseHeaders().set("Content-Length", "70");
			exchange.sendResponseHeaders(status, -1);
		}
		else {
			exchange.sendResponseHeaders(status, bytes.length);
			exchange.getResponseBody().write(bytes);
		}
		exchange.close();
	}

	@Test
	void anUploadLinkIsAskedForWithTheKeyInBothHeadersAndMadeAbsolute() {
		answer = "{\"url\":\"/object/upload/sign/assets/u/k?token=abc\",\"token\":\"abc\"}";

		var url = storage.presignUpload("u/k");

		assertThat(url.toString()).isEqualTo(
				"http://127.0.0.1:" + server.getAddress().getPort() + "/storage/v1/object/upload/sign/assets/u/k?token=abc");
		var request = seen.get(0);
		assertThat(request.method()).isEqualTo("POST");
		assertThat(request.path()).isEqualTo("/storage/v1/object/upload/sign/assets/u/k");
		// A new-style "sb_secret_" key is only accepted in apikey; the legacy JWT works in either.
		assertThat(request.apikey()).isEqualTo("sb_secret_test");
		assertThat(request.authorization()).isEqualTo("Bearer sb_secret_test");
	}

	@Test
	void aDownloadLinkAsksForTheLifetimeAndCanForceADownloadName() {
		answer = "{\"signedURL\":\"/object/sign/assets/u/k?token=abc\"}";

		var inline = storage.presignDownload("u/k", null, Duration.ofMinutes(5));
		var download = storage.presignDownload("u/k", "My Photo.png", Duration.ofMinutes(5));

		assertThat(seen.get(0).body()).isEqualTo("{\"expiresIn\":300}");
		assertThat(inline.getQuery()).isEqualTo("token=abc");
		assertThat(download.getRawQuery()).isEqualTo("token=abc&download=My%20Photo.png");
	}

	@Test
	void aStoredObjectsSizeAndTypeAreReadWithAHeadRequest() {
		var stored = storage.head("u/k");

		assertThat(stored).hasValueSatisfying(object -> {
			assertThat(object.size()).isEqualTo(70);
			assertThat(object.contentType()).isEqualTo("image/png");
		});
		assertThat(seen.get(0).method()).isEqualTo("HEAD");
		assertThat(seen.get(0).path()).isEqualTo("/storage/v1/object/authenticated/assets/u/k");
	}

	@Test
	void aMissingObjectIsEmptyButAFailureIsNotMistakenForOne() {
		status = 400;
		assertThat(storage.head("u/k")).isEmpty();
		status = 404;
		assertThat(storage.head("u/k")).isEmpty();

		for (var failure : new int[] { 401, 403, 500, 503 }) {
			status = failure;
			assertThatThrownBy(() -> storage.head("u/k")).as("HTTP " + failure).isInstanceOf(ApiException.class)
					.extracting("code").isEqualTo("STORAGE_UNAVAILABLE");
		}
	}

	@Test
	void deletingAnAlreadyMissingObjectIsFineButABadKeyIsNot() {
		for (var fine : new int[] { 200, 400, 404 }) {
			status = fine;
			storage.delete("u/k");
		}

		for (var failure : new int[] { 401, 403, 500 }) {
			status = failure;
			assertThatThrownBy(() -> storage.delete("u/k")).as("HTTP " + failure).isInstanceOf(ApiException.class)
					.extracting("code").isEqualTo("STORAGE_UNAVAILABLE");
		}
		assertThat(seen).extracting(Seen::method).containsOnly("DELETE");
		assertThat(seen.get(0).path()).isEqualTo("/storage/v1/object/assets/u/k");
	}

	@Test
	void aLinkRequestThatFailsOrIsAnsweredWithoutALinkIsUnavailable() {
		status = 401;
		assertThatThrownBy(() -> storage.presignUpload("u/k")).isInstanceOf(ApiException.class);

		status = 200;
		answer = "{\"other\":1}";
		assertThatThrownBy(() -> storage.presignUpload("u/k")).isInstanceOf(ApiException.class);
	}

	@Test
	void withoutConfigurationOrWithAnUnreachableStorageTheAnswerIsUnavailableNeverACrash() {
		assertThatThrownBy(() -> storageAt("", "").presignUpload("u/k")).isInstanceOf(ApiException.class)
				.hasMessageContaining("not available");
		assertThatThrownBy(() -> storageAt("http://127.0.0.1:1/storage/v1", "key").head("u/k"))
				.isInstanceOf(ApiException.class).extracting("code").isEqualTo("STORAGE_UNAVAILABLE");
	}

}
