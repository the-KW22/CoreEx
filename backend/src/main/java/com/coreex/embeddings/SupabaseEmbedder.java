package com.coreex.embeddings;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

/**
 * The {@code embed} Edge Function over HTTP with the JDK client: texts go out in batches the function accepts, and the
 * secret travels in a header. Any failure becomes "unavailable", and the first one in a row is logged once, so a
 * sweep that retries every minute does not fill the log.
 */
@Component
class SupabaseEmbedder implements Embedder {

	private static final Logger log = LoggerFactory.getLogger(SupabaseEmbedder.class);

	private record Answer(float[][] vectors) {
	}

	private final EmbeddingProperties properties;

	private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

	private final JsonMapper json = JsonMapper.builder().build();

	private final AtomicBoolean failing = new AtomicBoolean();

	SupabaseEmbedder(EmbeddingProperties properties) {
		this.properties = properties;
	}

	@Override
	public Optional<List<float[]>> embed(List<String> texts) {
		if (texts.isEmpty()) {
			return Optional.of(List.of());
		}
		if (properties.url().isBlank() || properties.secret().isBlank()) {
			return unavailable("it is not configured (EMBED_URL and EMBED_SECRET)");
		}
		var vectors = new ArrayList<float[]>(texts.size());
		for (var from = 0; from < texts.size(); from += properties.batchSize()) {
			var batch = texts.subList(from, Math.min(from + properties.batchSize(), texts.size()));
			var embedded = embedBatch(batch);
			if (embedded.isEmpty()) {
				return Optional.empty();
			}
			vectors.addAll(embedded.get());
		}
		if (failing.compareAndSet(true, false)) {
			log.info("Embeddings are available again");
		}
		return Optional.of(vectors);
	}

	private Optional<List<float[]>> embedBatch(List<String> batch) {
		try {
			var request = HttpRequest.newBuilder(URI.create(properties.url())).timeout(properties.timeout())
					.header("X-Embed-Secret", properties.secret()).header("Content-Type", "application/json")
					.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("texts", batch)))).build();
			var response = http.send(request, HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() != 200) {
				return unavailable("it answered HTTP " + response.statusCode());
			}
			var vectors = json.readValue(response.body(), Answer.class).vectors();
			if (vectors == null || vectors.length != batch.size()
					|| Arrays.stream(vectors).anyMatch(v -> v == null || v.length != DIMENSIONS)) {
				return unavailable("it answered vectors of an unexpected shape");
			}
			return Optional.of(List.of(vectors));
		}
		catch (IOException e) {
			return unavailable("it could not be reached in time: " + e.getClass().getSimpleName());
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			return unavailable("the request was interrupted");
		}
		catch (RuntimeException e) {
			// A bad EMBED_URL or an answer that is not the JSON we expect; never log the texts or the secret.
			return unavailable("its url or answer is unusable: " + e.getClass().getSimpleName());
		}
	}

	private <T> Optional<T> unavailable(String why) {
		if (failing.compareAndSet(false, true)) {
			log.warn("Embeddings are unavailable ({}); search stays exact-word until they answer again", why);
		}
		return Optional.empty();
	}

}
