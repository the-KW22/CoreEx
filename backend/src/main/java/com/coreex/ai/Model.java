package com.coreex.ai;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import com.fasterxml.jackson.annotation.JsonIgnore;
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

	/** Sends the smallest possible call, to see whether the provider accepts this key. Throws Failure when it does not. */
	void check();

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

		/**
		 * What a tool returned (or why it failed), sent back on the next turn as a User message. A read of an Asset keeps its
		 * {@code assetId} and {@code mediaType}; the file's {@code data} is never stored. It is loaded again for each call to
		 * the model, so it is null when the block is read back from the database.
		 */
		record ToolResult(String toolUseId, String content, boolean isError, UUID assetId, String mediaType,
				@JsonIgnore byte[] data) implements ContentBlock {

			public ToolResult(String toolUseId, String content, boolean isError) {
				this(toolUseId, content, isError, null, null, null);
			}

		}

	}

	enum Role {
		USER, ASSISTANT
	}

	record Message(Role role, List<ContentBlock> blocks) {
	}

	/**
	 * A tool the model may call: its name, what it does, and its input as a JSON schema object. A {@code server} tool is run
	 * by the provider inside its own call (web search and web fetch): CoreEx never runs it, and its inputSchema holds its
	 * options instead (web_search reads {@code max_uses}).
	 */
	record ToolSpec(String name, String description, Map<String, Object> inputSchema, boolean server) {

		public ToolSpec(String name, String description, Map<String, Object> inputSchema) {
			this(name, description, inputSchema, false);
		}

	}

	/** A web page the provider says it retrieved, with its title. */
	record WebSource(String url, String title) {

		/** At most this many pages per reply. */
		public static final int MAX = 10;

		/** Keeps http and https pages only, once each, at most {@link #MAX}; a missing title is the URL. */
		public static List<WebSource> keep(List<WebSource> found) {
			var kept = new LinkedHashMap<String, WebSource>();
			for (var source : found) {
				if (source == null || source.url() == null || kept.size() >= MAX) {
					continue;
				}
				var url = source.url().strip();
				if (!isWeb(url)) {
					continue;
				}
				var title = source.title() == null || source.title().isBlank() ? url : source.title().strip();
				kept.putIfAbsent(url, new WebSource(url, title));
			}
			return List.copyOf(kept.values());
		}

		private static boolean isWeb(String url) {
			try {
				var scheme = URI.create(url).getScheme();
				return "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
			}
			catch (IllegalArgumentException e) {
				return false;
			}
		}

	}

	enum StopReason {
		END_TURN, TOOL_USE, MAX_TOKENS
	}

	/**
	 * What the model wrote in one turn and why it stopped; a {@link StopReason#TOOL_USE} turn needs its tools run.
	 * {@code webSearches} counts the provider's web searches in the turn (each one is billed), and {@code webSources} are
	 * the pages the provider retrieved.
	 */
	record Turn(List<ContentBlock> blocks, StopReason stopReason, long inputTokens, long outputTokens, long webSearches,
			List<WebSource> webSources) {

		public Turn(List<ContentBlock> blocks, StopReason stopReason, long inputTokens, long outputTokens) {
			this(blocks, stopReason, inputTokens, outputTokens, 0, List.of());
		}

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
