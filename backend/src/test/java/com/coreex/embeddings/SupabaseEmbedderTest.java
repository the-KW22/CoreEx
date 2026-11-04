package com.coreex.embeddings;

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

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.json.JsonMapper;

/** The real embed client against a tiny local HTTP server that answers like the Edge Function did when run locally. */
class SupabaseEmbedderTest {

	private record Seen(String method, String path, String secret, List<String> texts) {
	}

	private final JsonMapper json = JsonMapper.builder().build();

	private HttpServer server;

	private final List<Seen> seen = new ArrayList<>();

	private int status = 200;

	/** When set, sent instead of one vector per text. */
	private String answer;

	private Duration delay = Duration.ZERO;

	private String url;

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", this::handle);
		server.start();
		url = "http://127.0.0.1:" + server.getAddress().getPort() + "/functions/v1/embed";
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private SupabaseEmbedder embedder(String url, String secret, Duration timeout, int batchSize) {
		return new SupabaseEmbedder(new EmbeddingProperties(url, secret, timeout, batchSize));
	}

	private SupabaseEmbedder embedder() {
		return embedder(url, "s3cret", Duration.ofSeconds(2), 3);
	}

	private void handle(HttpExchange exchange) throws IOException {
		var body = json.readTree(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
		var texts = new ArrayList<String>();
		body.path("texts").forEach(t -> texts.add(t.asString()));
		seen.add(new Seen(exchange.getRequestMethod(), exchange.getRequestURI().getPath(),
				exchange.getRequestHeaders().getFirst("X-Embed-Secret"), texts));
		try {
			Thread.sleep(delay.toMillis());
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
		var bytes = (answer != null ? answer : vectorsFor(texts)).getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().add("Content-Type", "application/json");
		exchange.sendResponseHeaders(status, bytes.length);
		exchange.getResponseBody().write(bytes);
		exchange.close();
	}

	/** Each vector starts with its text's length, so the order of the answers can be checked. */
	private static String vectorsFor(List<String> texts) {
		var vectors = new ArrayList<String>();
		for (var text : texts) {
			var numbers = new ArrayList<String>();
			numbers.add(String.valueOf(text.length()));
			for (var i = 1; i < Embedder.DIMENSIONS; i++) {
				numbers.add("0.5");
			}
			vectors.add("[" + String.join(",", numbers) + "]");
		}
		return "{\"vectors\":[" + String.join(",", vectors) + "]}";
	}

	@Test
	void textsAreSentWithTheSecretAndComeBackAsVectorsInOrder() {
		var vectors = embedder().embed(List.of("a", "bbb", "cc"));

		assertThat(vectors).hasValueSatisfying(v -> assertThat(v).extracting(x -> x[0]).containsExactly(1f, 3f, 2f));
		assertThat(seen).hasSize(1);
		assertThat(seen.get(0).method()).isEqualTo("POST");
		assertThat(seen.get(0).path()).isEqualTo("/functions/v1/embed");
		assertThat(seen.get(0).secret()).isEqualTo("s3cret");
		assertThat(seen.get(0).texts()).containsExactly("a", "bbb", "cc");
		assertThat(vectors.get().get(0)).hasSize(Embedder.DIMENSIONS);
	}

	@Test
	void moreTextsThanOneBatchAreSplitAndJoinedInOrder() {
		var vectors = embedder().embed(List.of("1", "22", "333", "4444", "55555", "666666", "7777777"));

		assertThat(seen).extracting(Seen::texts).extracting(List::size).containsExactly(3, 3, 1);
		assertThat(vectors).hasValueSatisfying(
				v -> assertThat(v).extracting(x -> x[0]).containsExactly(1f, 2f, 3f, 4f, 5f, 6f, 7f));
	}

	@Test
	void noTextsMeansNoRequest() {
		assertThat(embedder().embed(List.of())).hasValue(List.of());
		assertThat(seen).isEmpty();
	}

	@Test
	void aFailureInAnyBatchMakesTheWholeResultUnavailable() {
		status = 500;

		assertThat(embedder().embed(List.of("1", "2", "3", "4"))).isEmpty();
		assertThat(seen).hasSize(1); // it stops at the first failing batch
	}

	@Test
	void everyKindOfFailureIsUnavailableAndNeverThrows() {
		for (var failure : new int[] { 400, 401, 500, 503, 546 }) {
			status = failure;
			assertThat(embedder().embed(List.of("a"))).as("HTTP " + failure).isEmpty();
		}
		status = 200;

		for (var unusable : new String[] { "not json", "{}", "{\"vectors\":null}", "{\"vectors\":[]}",
				"{\"vectors\":[[1,2,3]]}", "{\"vectors\":[null]}" }) {
			answer = unusable;
			assertThat(embedder().embed(List.of("a"))).as(unusable).isEmpty();
		}
		answer = null;

		assertThat(embedder("not a url", "s3cret", Duration.ofSeconds(1), 3).embed(List.of("a"))).isEmpty();
		assertThat(embedder("http://127.0.0.1:1/embed", "s3cret", Duration.ofSeconds(1), 3).embed(List.of("a")))
				.isEmpty();
	}

	@Test
	void aSlowAnswerIsUnavailableAfterTheTimeout() {
		delay = Duration.ofMillis(800);

		var started = System.nanoTime();
		var vectors = embedder(url, "s3cret", Duration.ofMillis(150), 3).embed(List.of("a"));

		assertThat(vectors).isEmpty();
		assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(700));
	}

	@Test
	void withoutAnUrlOrSecretNothingIsSent() {
		assertThat(embedder("", "s3cret", Duration.ofSeconds(1), 3).embed(List.of("a"))).isEmpty();
		assertThat(embedder(url, "", Duration.ofSeconds(1), 3).embed(List.of("a"))).isEmpty();
		assertThat(seen).isEmpty();
	}

	@Test
	void aBatchSizeBelowOneIsRefusedAtStartUp() {
		assertThatThrownBy(() -> new EmbeddingProperties(url, "s3cret", Duration.ofSeconds(1), 0))
				.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void itWorksAgainAfterTheFunctionRecovers() {
		var embedder = embedder();
		status = 503;
		assertThat(embedder.embed(List.of("a"))).isEmpty();

		status = 200;
		assertThat(embedder.embed(List.of("a"))).isPresent();
	}

}
