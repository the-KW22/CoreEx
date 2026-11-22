package com.coreex.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import com.coreex.ai.Model.ContentBlock.Text;
import com.coreex.ai.Model.ContentBlock.ToolUse;
import com.coreex.ai.Model.Message;
import com.coreex.ai.Model.Role;
import com.coreex.ai.Model.StopReason;
import com.coreex.ai.Model.ToolSpec;
import com.sun.net.httpserver.HttpServer;

/** The Shared key's client, against a small server that answers like the Messages API. */
class AnthropicModelTest {

	private static final String TEXT_STREAM = """
			event: message_start
			data: {"type":"message_start","message":{"id":"msg_2","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":200,"output_tokens":1,"cache_creation_input_tokens":50,"cache_read_input_tokens":300}}}

			event: content_block_start
			data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

			event: content_block_delta
			data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}

			event: content_block_delta
			data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there."}}

			event: content_block_stop
			data: {"type":"content_block_stop","index":0}

			event: message_delta
			data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}

			event: message_stop
			data: {"type":"message_stop"}

			""";

	private static final String TOOL_STREAM = """
			event: message_start
			data: {"type":"message_start","message":{"id":"msg_3","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":80,"output_tokens":1}}}

			event: content_block_start
			data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"search","input":{}}}

			event: content_block_delta
			data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":"}}

			event: content_block_delta
			data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"rust\\"}"}}

			event: content_block_stop
			data: {"type":"content_block_stop","index":0}

			event: message_delta
			data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":20}}

			event: message_stop
			data: {"type":"message_stop"}

			""";

	private HttpServer server;

	private final AtomicReference<String> path = new AtomicReference<>();

	private final AtomicReference<String> key = new AtomicReference<>();

	private final AtomicReference<String> beta = new AtomicReference<>();

	private final AtomicReference<String> body = new AtomicReference<>();

	private volatile int status = 200;

	private volatile String answer = """
			{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[{"type":"text","text":"{\\"company\\":\\"Acme\\"}"}],
			 "stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":120,"output_tokens":30}}""";

	/** When set, the server answers with this event stream instead of {@link #answer}. */
	private volatile String stream;

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		server.createContext("/", exchange -> {
			path.set(exchange.getRequestURI().getPath());
			key.set(exchange.getRequestHeaders().getFirst("Authorization"));
			beta.set(exchange.getRequestHeaders().getFirst("anthropic-beta"));
			body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			var streamed = stream;
			var bytes = (streamed != null ? streamed : answer).getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", streamed != null ? "text/event-stream" : "application/json");
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
				"http://127.0.0.1:" + server.getAddress().getPort(), 0.5, 4.0, 20.0, 1000, 100_000));
	}

	private static Message user(String text) {
		return new Message(Role.USER, List.of(new Text(text)));
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
				.hasMessageNotContaining("secret detail")
				.satisfies(e -> assertThat(((Model.Failure) e).kind()).isEqualTo(Model.Failure.Kind.UNAVAILABLE));
	}

	@Test
	void aStreamedTextReplyCallsBackWithEachPieceAndReturnsTheBlocksAndTheTokens() {
		stream = TEXT_STREAM;
		var pieces = new ArrayList<String>();

		var turn = model().converse("Be brief.", List.of(user("Hi")), List.of(), pieces::add, 500);

		assertThat(pieces).containsExactly("Hello ", "there.");
		assertThat(turn.blocks()).containsExactly(new Text("Hello there."));
		assertThat(turn.stopReason()).isEqualTo(StopReason.END_TURN);
		assertThat(turn.inputTokens()).isEqualTo(200 + 50 + 300); // cache writes and reads count as input
		assertThat(turn.outputTokens()).isEqualTo(12);
	}

	@Test
	void aStreamedToolUseReplyReturnsTheToolCallWithItsParsedInput() {
		stream = TOOL_STREAM;

		var turn = model().converse("Find things.", List.of(user("Rust?")), List.of(), piece -> {}, 500);

		assertThat(turn.blocks()).containsExactly(new ToolUse("toolu_1", "search", Map.of("query", "rust")));
		assertThat(turn.stopReason()).isEqualTo(StopReason.TOOL_USE);
	}

	@Test
	void theConversationRequestCachesTheInstructionsAndToolsAndAsksForOldToolResultsToBeCleared() {
		stream = TEXT_STREAM;
		var search = new ToolSpec("search", "Search the Notes.",
				Map.of("type", "object", "properties", Map.of("query", Map.of("type", "string")), "required", List.of("query")));

		model().converse("Be brief.", List.of(user("Find rust notes")), List.of(search), piece -> {}, 500);

		assertThat(body.get()).contains("\"system\"").contains("Be brief.")
				.contains("\"cache_control\":{\"type\":\"ephemeral\"}")
				.contains("\"tools\"").contains("\"name\":\"search\"").contains("Search the Notes.")
				.contains("\"input_schema\":{\"type\":\"object\"").contains("\"properties\":{\"query\":{\"type\":\"string\"}}")
				.contains("\"messages\"").contains("Find rust notes")
				.contains("context_management").contains("clear_tool_uses_20250919").contains("100000");
		assertThat(beta.get()).contains("context-management-2025-06-27");
	}

	@Test
	void aPaymentErrorFromTheProviderIsOutOfCredit() {
		status = 402;
		answer = "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"Your credit balance is too low\"}}";

		assertThatThrownBy(() -> model().converse("s", List.of(user("hi")), List.of(), piece -> {}, 100))
				.isInstanceOfSatisfying(Model.Failure.class,
						e -> assertThat(e.kind()).isEqualTo(Model.Failure.Kind.OUT_OF_CREDIT));
	}

	@Test
	void aServerErrorIsUnavailableAndNeitherTheFailureNorTheLogsCarryTheProvidersBody() {
		status = 500;
		answer = "{\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"secret detail SECRET-VALUE\"}}";
		var logs = new ListAppender<ILoggingEvent>();
		var logger = (Logger) LoggerFactory.getLogger(AnthropicModel.class);
		logs.start();
		logger.addAppender(logs);
		try {
			assertThatThrownBy(() -> model().converse("s", List.of(user("hi")), List.of(), piece -> {}, 100))
					.isInstanceOfSatisfying(Model.Failure.class, e -> {
						assertThat(e.kind()).isEqualTo(Model.Failure.Kind.UNAVAILABLE);
						assertThat(e.getMessage()).doesNotContain("SECRET-VALUE");
					});
		}
		finally {
			logger.detachAppender(logs);
		}
		assertThat(logs.list).isNotEmpty();
		assertThat(logs.list).allSatisfy(event -> assertThat(event.getFormattedMessage()).doesNotContain("SECRET-VALUE"));
		assertThat(logs.list.get(0).getFormattedMessage()).contains("500");
	}

}
