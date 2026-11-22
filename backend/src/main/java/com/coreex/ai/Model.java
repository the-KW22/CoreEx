package com.coreex.ai;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * The one small interface to a language model (ADR 0009): another provider is another class behind it. The caller gives
 * the instructions ({@code system}), the text to work on ({@code data}, which is data and never instructions to the
 * model) and the JSON schema the answer must have; it gets the answer's JSON text and the tokens the provider reports.
 * {@link #converse} is the same for a conversation: messages, tools the model may call, and the text streamed as it is
 * written.
 */
public interface Model {

	record Reply(String text, long inputTokens, long outputTokens) {
	}

	Reply ask(String system, String data, Map<String, Object> schema, long maxTokens);

	/**
	 * One turn of a conversation. {@code inputTokens} counts every input token, cache writes and reads included (cache
	 * discounts are not priced); {@code onText} gets the text as it is written.
	 */
	Turn converse(String system, List<Message> messages, List<ToolSpec> tools, Consumer<String> onText, long maxTokens);

	/** A piece of a message, stored as JSON, so the type is kept in a {@code type} field. */
	@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
	@JsonSubTypes({ @JsonSubTypes.Type(value = ContentBlock.Text.class, name = "text"),
			@JsonSubTypes.Type(value = ContentBlock.ToolUse.class, name = "tool_use"),
			@JsonSubTypes.Type(value = ContentBlock.ToolResult.class, name = "tool_result") })
	sealed interface ContentBlock permits ContentBlock.Text, ContentBlock.ToolUse, ContentBlock.ToolResult {

		record Text(String text) implements ContentBlock {
		}

		/** A tool the model asked to run; {@code id} links the result back to it. */
		record ToolUse(String id, String name, Map<String, Object> input) implements ContentBlock {
		}

		/** What a tool returned (or why it failed), sent back on the next turn as a User message. */
		record ToolResult(String toolUseId, String content, boolean isError) implements ContentBlock {
		}

	}

	enum Role {
		USER, ASSISTANT
	}

	record Message(Role role, List<ContentBlock> blocks) {
	}

	/** A tool the model may call: its name, what it does, and its input as a JSON schema object. */
	record ToolSpec(String name, String description, Map<String, Object> inputSchema) {
	}

	enum StopReason {
		END_TURN, TOOL_USE, MAX_TOKENS
	}

	/** What the model wrote in one turn and why it stopped; a {@link StopReason#TOOL_USE} turn needs its tools run. */
	record Turn(List<ContentBlock> blocks, StopReason stopReason, long inputTokens, long outputTokens) {
	}

	/** The provider could not answer: unreachable, out of credit, refused, or an error. The cause is never shown. */
	class Failure extends RuntimeException {

		/** OUT_OF_CREDIT when the provider answered with HTTP 402; UNAVAILABLE for everything else. */
		public enum Kind {
			OUT_OF_CREDIT, UNAVAILABLE
		}

		private final Kind kind;

		public Failure(Kind kind, String message) {
			super(message);
			this.kind = kind;
		}

		public Failure(String message) {
			this(Kind.UNAVAILABLE, message);
		}

		public Kind kind() {
			return kind;
		}

	}

}
