package com.coreex.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.helpers.BetaMessageAccumulator;
import com.anthropic.models.beta.messages.BetaAssistantMessageParam;
import com.anthropic.models.beta.messages.BetaCacheControlEphemeral;
import com.anthropic.models.beta.messages.BetaClearToolUses20250919Edit;
import com.anthropic.models.beta.messages.BetaContentBlockParam;
import com.anthropic.models.beta.messages.BetaContextManagementConfig;
import com.anthropic.models.beta.messages.BetaMessage;
import com.anthropic.models.beta.messages.BetaStopReason;
import com.anthropic.models.beta.messages.BetaTextBlockParam;
import com.anthropic.models.beta.messages.BetaTool;
import com.anthropic.models.beta.messages.BetaToolResultBlockParam;
import com.anthropic.models.beta.messages.BetaToolUnion;
import com.anthropic.models.beta.messages.BetaToolUseBlock;
import com.anthropic.models.beta.messages.BetaToolUseBlockParam;
import com.anthropic.models.beta.messages.BetaUserMessageParam;
import com.anthropic.models.messages.JsonOutputFormat;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;

/** Claude, on the Shared key, through the official Java SDK. The key never leaves the backend. */
class AnthropicModel implements Model {

	private static final Logger log = LoggerFactory.getLogger(AnthropicModel.class);

	/** The beta that lets the provider clear old tool results (context editing). */
	private static final String CONTEXT_EDITING_BETA = "context-management-2025-06-27";

	private static final String FAILED = "The model could not answer";

	private final String model;

	private final long contextClearTokens;

	private final AnthropicClient client;

	AnthropicModel(AiProperties properties) {
		this.model = properties.model();
		this.contextClearTokens = properties.contextClearTokens();
		var builder = AnthropicOkHttpClient.builder().apiKey(properties.apiKey());
		if (!properties.baseUrl().isBlank()) {
			builder.baseUrl(properties.baseUrl());
		}
		this.client = builder.build();
	}

	@Override
	public Reply ask(String system, String data, Map<String, Object> schema, long maxTokens) {
		try {
			var shape = JsonOutputFormat.Schema.builder();
			schema.forEach((name, value) -> shape.putAdditionalProperty(name, JsonValue.from(value)));
			var params = MessageCreateParams.builder().model(model).maxTokens(maxTokens).system(system)
					.outputConfig(OutputConfig.builder().format(JsonOutputFormat.builder().schema(shape.build()).build()).build())
					.addUserMessage(data).build();
			var response = client.messages().create(params);
			var text = response.content().stream().flatMap(block -> block.text().stream()).map(t -> t.text())
					.collect(Collectors.joining());
			return new Reply(text, response.usage().inputTokens(), response.usage().outputTokens());
		}
		catch (RuntimeException e) {
			throw failure(e);
		}
	}

	@Override
	public Turn converse(String system, List<Message> messages, List<ToolSpec> tools, Consumer<String> onText, long maxTokens) {
		try {
			var accumulator = BetaMessageAccumulator.create();
			try (var events = client.beta().messages().createStreaming(params(system, messages, tools, maxTokens))) {
				events.stream().forEach(event -> {
					event.contentBlockDelta().flatMap(delta -> delta.delta().text()).ifPresent(text -> onText.accept(text.text()));
					accumulator.accumulate(event);
				});
			}
			var message = accumulator.message();
			var usage = message.usage();
			// shortcut: cache writes and reads are counted as plain input tokens and not priced at their discounts, which
			// overstates the cost of cached turns. Upgrade to price cache reads and writes when the budget needs the accuracy.
			var input = usage.inputTokens() + usage.cacheCreationInputTokens().orElse(0L) + usage.cacheReadInputTokens().orElse(0L);
			return new Turn(blocks(message), stopReason(message), input, usage.outputTokens());
		}
		catch (RuntimeException e) {
			throw failure(e);
		}
	}

	/** The request: the instructions and the tools are cached, and old tool results are cleared past the threshold. */
	private com.anthropic.models.beta.messages.MessageCreateParams params(String system, List<Message> messages, List<ToolSpec> tools,
			long maxTokens) {
		var builder = com.anthropic.models.beta.messages.MessageCreateParams.builder().model(model).maxTokens(maxTokens)
				.system(com.anthropic.models.beta.messages.MessageCreateParams.System.ofBetaTextBlockParams(List.of(
						BetaTextBlockParam.builder().text(system).cacheControl(cache()).build())));
		// The cache covers the tools and the instructions up to the last tool, so the last tool carries the marker.
		for (var i = 0; i < tools.size(); i++) {
			var tool = BetaTool.builder().name(tools.get(i).name()).description(tools.get(i).description())
					.inputSchema(schema(tools.get(i).inputSchema()));
			if (i == tools.size() - 1) {
				tool.cacheControl(cache());
			}
			builder.addTool(BetaToolUnion.ofBetaTool(tool.build()));
		}
		for (var message : messages) {
			var blocks = message.blocks().stream().map(AnthropicModel::param).toList();
			if (message.role() == Role.USER) {
				builder.addMessage(BetaUserMessageParam.ofContentBlockParams(blocks));
			}
			else {
				builder.addMessage(BetaAssistantMessageParam.ofContentBlockParams(blocks));
			}
		}
		if (contextClearTokens > 0) {
			builder.addBeta(CONTEXT_EDITING_BETA).contextManagement(BetaContextManagementConfig.builder()
					.addEdit(BetaContextManagementConfig.Edit.ofClearToolUses20250919(BetaClearToolUses20250919Edit.builder()
							.trigger(BetaClearToolUses20250919Edit.Trigger.ofInputTokens(contextClearTokens)).build()))
					.build());
		}
		return builder.build();
	}

	private static BetaCacheControlEphemeral cache() {
		return BetaCacheControlEphemeral.builder().build();
	}

	private static BetaTool.InputSchema schema(Map<String, Object> schema) {
		var shape = BetaTool.InputSchema.builder();
		// The SDK writes "type": "object" itself, so that key is left out of the schema's own properties.
		schema.forEach((name, value) -> {
			if (!name.equals("type")) {
				shape.putAdditionalProperty(name, JsonValue.from(value));
			}
		});
		return shape.build();
	}

	private static BetaContentBlockParam param(ContentBlock block) {
		return switch (block) {
			case ContentBlock.Text text -> BetaContentBlockParam.ofText(text.text());
			case ContentBlock.ToolUse use -> BetaContentBlockParam.ofToolUse(BetaToolUseBlockParam.builder().id(use.id())
					.name(use.name()).input(toolInput(use.input())).build());
			case ContentBlock.ToolResult result -> BetaContentBlockParam.ofToolResult(BetaToolResultBlockParam.builder()
					.toolUseId(result.toolUseId()).content(result.content()).isError(result.isError()).build());
		};
	}

	private static BetaToolUseBlockParam.Input toolInput(Map<String, Object> input) {
		var shape = BetaToolUseBlockParam.Input.builder();
		input.forEach((name, value) -> shape.putAdditionalProperty(name, JsonValue.from(value)));
		return shape.build();
	}

	private static List<ContentBlock> blocks(BetaMessage message) {
		var blocks = new ArrayList<ContentBlock>();
		for (var block : message.content()) {
			if (block.isText()) {
				blocks.add(new ContentBlock.Text(block.text().orElseThrow().text()));
			}
			else if (block.isToolUse()) {
				var use = block.toolUse().orElseThrow();
				blocks.add(new ContentBlock.ToolUse(use.id(), use.name(), toolInput(use)));
			}
		}
		return blocks;
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> toolInput(BetaToolUseBlock use) {
		return use.input(Map.class);
	}

	/** Only a tool call or the token limit says more is coming; any other stop is a finished answer. */
	private static StopReason stopReason(BetaMessage message) {
		var reason = message.stopReason().orElse(BetaStopReason.END_TURN);
		if (reason.equals(BetaStopReason.TOOL_USE)) {
			return StopReason.TOOL_USE;
		}
		if (reason.equals(BetaStopReason.MAX_TOKENS)) {
			return StopReason.MAX_TOKENS;
		}
		return StopReason.END_TURN;
	}

	/**
	 * Errors are chosen by HTTP status only (402 is out of credit, anything else, including no answer at all, is
	 * unavailable). The provider's body and message are never kept: not in the Failure, not in the log.
	 */
	private static Failure failure(RuntimeException e) {
		var status = e instanceof AnthropicServiceException service ? service.statusCode() : 0;
		log.warn("The model call failed: {}, HTTP status {}", e.getClass().getSimpleName(), status == 0 ? "none" : status);
		return new Failure(status == 402 ? Failure.Kind.OUT_OF_CREDIT : Failure.Kind.UNAVAILABLE, FAILED);
	}

}
