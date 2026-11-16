package com.coreex.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

/** The Shared key's client, against a small server that answers like the Messages API. */
class AnthropicModelTest {

	private HttpServer server;

	private final AtomicReference<String> path = new AtomicReference<>();

	private final AtomicReference<String> key = new AtomicReference<>();

	private final AtomicReference<String> body = new AtomicReference<>();

	private volatile int status = 200;

	private volatile String answer = """
			{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[{"type":"text","text":"{\\"company\\":\\"Acme\\"}"}],
			 "stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":120,"output_tokens":30}}""";

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		server.createContext("/", exchange -> {
			path.set(exchange.getRequestURI().getPath());
			key.set(exchange.getRequestHeaders().getFirst("Authorization"));
			body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			var bytes = answer.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(status, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private AnthropicModel model() {
		return new AnthropicModel(new AiProperties("anthropic", "sk-test-key", "claude-opus-5-5",
				"http://127.0.0.1:" + server.getAddress().getPort(), 0.5, 4.0, 20.0, 1000));
	}

	@Test
	void theRequestCarriesTheKeyTheModelTheInstructionsTheDataAndTheSchemaAndTheAnswerAndTokensComeBack() {
		var reply = model().ask("Read the posting.", "<posting>Dev at Acme</posting>",
				Map.of("type", "object", "properties", Map.of("company", Map.of("type", "string")), "required", List.of("company"),
						"additionalProperties", false),
				1000);

		assertThat(path.get()).isEqualTo("/v1/messages");
		assertThat(key.get()).isEqualTo("Bearer sk-test-key"); // the SDK sends the key as a bearer credential
		assertThat(body.get()).contains("\"model\":\"claude-opus-5-5\"").contains("\"max_tokens\":1000")
				.contains("Read the posting.").contains("<posting>Dev at Acme</posting>").contains("json_schema")
				.contains("\"company\"");
		assertThat(reply.text()).isEqualTo("{\"company\":\"Acme\"}");
		assertThat(reply.inputTokens()).isEqualTo(120);
		assertThat(reply.outputTokens()).isEqualTo(30);
	}

	@Test
	void anErrorFromTheProviderIsAFailureWithoutItsDetails() {
		status = 529;
		answer = "{\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"secret detail\"}}";

		assertThatThrownBy(() -> model().ask("s", "d", Map.of("type", "object"), 100)).isInstanceOf(Model.Failure.class)
				.hasMessageNotContaining("secret detail");
	}

}
