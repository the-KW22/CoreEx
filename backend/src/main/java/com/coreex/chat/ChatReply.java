package com.coreex.chat;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.coreex.ai.AiService;
import com.coreex.ai.DataMarkers;
import com.coreex.ai.Model;
import com.coreex.ai.Model.ContentBlock;
import com.coreex.common.ApiException;
import com.coreex.identity.User;

/**
 * One reply of a Chat, run on the server: it asks the model, runs the tools it asks for, and asks again until the model
 * answers without a tool. Everything is written to the database as it happens, so a reply survives the browser closing;
 * the SSE stream is only a copy for the one who is listening, and a failed write to it changes nothing.
 */
final class ChatReply {

	static final String TIME_LIMIT = "Time limit reached. Ask me to continue.";

	static final String STOPPED = "STOPPED";

	static final String COMPLETE = "COMPLETE";

	static final String STREAMING = "STREAMING";

	static final String FAILED = "FAILED";

	private static final Logger LOG = LoggerFactory.getLogger(ChatReply.class);

	private static final Duration SAVE_EVERY = Duration.ofSeconds(1);

	private static final String UNAVAILABLE = "The AI service could not answer just now. Try again.";

	private static final String OUT_OF_CREDIT = "The AI service has run out of credit, so the reply stopped. Try again later.";

	record TextEvent(String text) {
	}

	record ToolEvent(String name) {
	}

	/** The reply's status and the sources of the turn it finished. */
	record DoneEvent(String status, List<ChatSources.Source> sources) {
	}

	record ErrorEvent(String code, String message) {
	}

	/** Ends the model call early because the reply was stopped or ran out of time. Never shown to anyone. */
	private static final class Interrupt extends RuntimeException {

		Interrupt() {
			super(null, null, false, false);
		}

	}

	/** The reply is over, with this status: COMPLETE, or STOPPED when the User pressed Stop (or deleted the Chat). */
	private static final class Ended extends RuntimeException {

		final String status;

		Ended(String status) {
			super(status, null, false, false);
			this.status = status;
		}

	}

	/** A provider failure, already stored on the message; the User sees this code in an error event. */
	private static final class Failed extends RuntimeException {

		final String code;

		Failed(String code, String message) {
			super(message, null, false, false);
			this.code = code;
		}

	}

	private final ChatRepository chats;

	private final AiService ai;

	private final ChatTools tools;

	private final ChatProperties properties;

	private final Clock clock;

	private final User owner;

	private final UUID chatId;

	/** The Use my Notes switch for this reply: when off, no tools are offered and the tool blocks are not replayed. */
	private final boolean useNotes;

	private final ChatSources sources;

	private final SseEmitter out;

	private final Instant deadline;

	private final AtomicBoolean stop = new AtomicBoolean();

	private final CountDownLatch ended = new CountDownLatch(1);

	private final StringBuilder streamed = new StringBuilder();

	private Instant lastSaved;

	private UUID assistantId;

	private List<ContentBlock> assistantBlocks = List.of();

	private boolean clientGone;

	ChatReply(ChatRepository chats, AiService ai, ChatTools tools, ChatProperties properties, Clock clock, User owner,
			UUID chatId, boolean useNotes, ChatSources sources, SseEmitter out) {
		this.chats = chats;
		this.ai = ai;
		this.tools = tools;
		this.properties = properties;
		this.clock = clock;
		this.owner = owner;
		this.chatId = chatId;
		this.useNotes = useNotes;
		this.sources = sources;
		this.out = out;
		this.deadline = clock.instant().plus(properties.maxReplyDuration());
	}

	/** Asks Stop: what was written is kept and the reply ends at its next chance to check. */
	void requestStop() {
		stop.set(true);
	}

	/** Waits until the reply has finished and its claim is released (for tests). */
	boolean awaitEnd() throws InterruptedException {
		return ended.await(10, TimeUnit.SECONDS);
	}

	/** Runs the reply; {@code release} frees the Chat's claim and forgets the reply, and runs before the last event. */
	void run(Runnable release) {
		String status = COMPLETE;
		String errorCode = null;
		String errorMessage = null;
		List<ChatSources.Source> turnSources = List.of();
		try {
			status = loop();
		}
		catch (Ended e) {
			status = e.status;
		}
		catch (Failed e) {
			errorCode = e.code;
			errorMessage = e.getMessage();
		}
		catch (RuntimeException e) {
			LOG.warn("A Chat reply stopped on an unexpected error", e);
			errorCode = "AI_UNAVAILABLE";
			errorMessage = UNAVAILABLE;
		}
		finally {
			if (errorCode == null) {
				turnSources = newestTurnSources();
			}
			release.run();
			ended.countDown();
		}
		if (errorCode != null) {
			send("error", new ErrorEvent(errorCode, errorMessage));
		}
		else {
			send("done", new DoneEvent(status, turnSources));
		}
		try {
			out.complete();
		}
		catch (RuntimeException ignored) {
			// The browser already went away; nothing is waiting for this.
		}
	}

	private String loop() {
		var toolSteps = 0;
		while (true) {
			if (stop.get()) {
				return STOPPED;
			}
			if (toolSteps >= properties.maxToolSteps() || (assistantId != null && timeUp())) {
				addTimeLimitNote();
				return COMPLETE;
			}
			var turn = callModel();
			if (turn.stopReason() != Model.StopReason.TOOL_USE) {
				return COMPLETE;
			}
			var results = new ArrayList<ContentBlock>();
			for (var block : turn.blocks()) {
				if (block instanceof ContentBlock.ToolUse use) {
					send("tool", new ToolEvent(use.name()));
					results.add(runTool(use));
				}
			}
			chats.addMessage(chatId, Model.Role.USER, results, COMPLETE, null, List.of(), clock.instant());
			toolSteps++;
		}
	}

	/** One model call: a new assistant message that is written as the text streams in, then the final blocks. */
	private Model.Turn callModel() {
		var history = history();
		var now = clock.instant();
		streamed.setLength(0);
		lastSaved = now;
		assistantBlocks = List.of();
		assistantId = chats.addMessage(chatId, Model.Role.ASSISTANT, List.of(), STREAMING, null, List.of(), now);
		Model.Turn turn;
		try {
			turn = ai.converse(ChatPrompt.GENERAL, history, useNotes ? tools.specs() : List.of(), this::onText,
					properties.maxOutputTokens());
		}
		catch (RuntimeException e) {
			if (stop.get()) {
				countAborted(history);
				keepPartial(STOPPED, null);
				throw new Ended(STOPPED);
			}
			if (timeUp()) {
				countAborted(history);
				keepPartialWithTimeLimit();
				throw new Ended(COMPLETE);
			}
			var failed = failure(e);
			keepPartial(FAILED, failed.code);
			throw failed;
		}
		ai.record(owner.id(), turn.inputTokens(), turn.outputTokens());
		assistantBlocks = turn.blocks();
		chats.setMessage(assistantId, assistantBlocks, COMPLETE, null);
		return turn;
	}

	/**
	 * A call cut short reports no tokens, but the provider still bills it, so Stop must not be a way round the budget.
	 * shortcut: about 4 characters per token, counted from the history sent and the text received; upgrade if the
	 * provider's own count of an aborted call becomes available.
	 */
	private void countAborted(List<Model.Message> history) {
		ai.record(owner.id(), history.toString().length() / 4, streamed.length() / 4);
	}

	/** Each text piece goes to the listener and, about once a second, to the database, so a partial reply survives. */
	private void onText(String delta) {
		if (stop.get() || timeUp()) {
			throw new Interrupt();
		}
		streamed.append(delta);
		send("text", new TextEvent(delta));
		var now = clock.instant();
		if (!now.isBefore(lastSaved.plus(SAVE_EVERY))) {
			lastSaved = now;
			chats.setMessage(assistantId, List.of(new ContentBlock.Text(streamed.toString())), STREAMING, null);
		}
	}

	private ContentBlock runTool(ContentBlock.ToolUse use) {
		try {
			return new ContentBlock.ToolResult(use.id(), tools.run(owner, use.name(), use.input()), false);
		}
		catch (ApiException e) {
			return new ContentBlock.ToolResult(use.id(), e.getMessage(), true);
		}
		catch (RuntimeException e) {
			LOG.debug("A Chat tool failed: {}", use.name());
			return new ContentBlock.ToolResult(use.id(), "The tool failed.", true);
		}
	}

	private void addTimeLimitNote() {
		assistantBlocks = append(assistantBlocks, new ContentBlock.Text(TIME_LIMIT));
		chats.setMessage(assistantId, assistantBlocks, COMPLETE, null);
	}

	/** Keeps the text written so far. A stopped answer with nothing in it leaves no message behind. */
	private void keepPartial(String status, String errorCode) {
		var blocks = streamed.isEmpty() ? List.<ContentBlock>of() : List.<ContentBlock>of(new ContentBlock.Text(streamed.toString()));
		if (blocks.isEmpty() && STOPPED.equals(status)) {
			chats.deleteMessage(assistantId);
			return;
		}
		assistantBlocks = blocks;
		chats.setMessage(assistantId, blocks, status, errorCode);
	}

	private void keepPartialWithTimeLimit() {
		var blocks = streamed.isEmpty() ? List.<ContentBlock>of() : List.<ContentBlock>of(new ContentBlock.Text(streamed.toString()));
		assistantBlocks = append(blocks, new ContentBlock.Text(TIME_LIMIT));
		chats.setMessage(assistantId, assistantBlocks, COMPLETE, null);
	}

	private static List<ContentBlock> append(List<ContentBlock> blocks, ContentBlock block) {
		var more = new ArrayList<>(blocks);
		more.add(block);
		return List.copyOf(more);
	}

	/**
	 * The stored messages as the model receives them. A tool result is wrapped as data under its tool's name. A User's text
	 * is followed by the pieces quoted for it. With Notes off no tools are offered, so the tool blocks are left out. A
	 * message with nothing left in it is skipped.
	 */
	private List<Model.Message> history() {
		var rows = chats.messages(chatId);
		var toolNames = new HashMap<String, String>();
		for (var row : rows) {
			for (var block : row.blocks()) {
				if (block instanceof ContentBlock.ToolUse use) {
					toolNames.put(use.id(), use.name());
				}
			}
		}
		var messages = new ArrayList<Model.Message>();
		for (var row : rows) {
			var blocks = new ArrayList<ContentBlock>();
			for (var block : row.blocks()) {
				if (block instanceof ContentBlock.ToolUse || block instanceof ContentBlock.ToolResult) {
					if (!useNotes) {
						continue;
					}
					if (block instanceof ContentBlock.ToolResult result) {
						var tool = toolNames.getOrDefault(result.toolUseId(), "unknown");
						blocks.add(new ContentBlock.ToolResult(result.toolUseId(), DataMarkers.data(tool, result.content()),
								result.isError()));
						continue;
					}
				}
				blocks.add(block);
			}
			if (row.role() == Model.Role.USER && !row.quotes().isEmpty()) {
				blocks.add(new ContentBlock.Text(quoted(row.quotes())));
			}
			if (!blocks.isEmpty()) {
				messages.add(new Model.Message(row.role(), List.copyOf(blocks)));
			}
		}
		return messages;
	}

	/** The pieces quoted for a message, each in its own note marker. */
	private static String quoted(List<Quote> quotes) {
		return quotes.stream().map(q -> DataMarkers.note(q.id(), q.title(), q.headingPath() == null ? "" : q.headingPath(), q.text()))
				.reduce((a, b) -> a + "\n\n" + b).orElse("");
	}

	/** The sources of the turn just finished. Never throws: a failed read leaves the done event without sources. */
	private List<ChatSources.Source> newestTurnSources() {
		try {
			return sources.ofNewestTurn(owner.id(), chats.messages(chatId));
		}
		catch (RuntimeException e) {
			LOG.warn("A Chat's sources could not be read", e);
			return List.of();
		}
	}

	private boolean timeUp() {
		return !clock.instant().isBefore(deadline);
	}

	private static Failed failure(RuntimeException e) {
		if (e instanceof Model.Failure failure && failure.kind() == Model.Failure.Kind.OUT_OF_CREDIT) {
			return new Failed("AI_OUT_OF_CREDIT", OUT_OF_CREDIT);
		}
		return new Failed("AI_UNAVAILABLE", UNAVAILABLE);
	}

	private void send(String name, Object data) {
		if (clientGone) {
			return;
		}
		try {
			out.send(SseEmitter.event().name(name).data(data, MediaType.APPLICATION_JSON));
		}
		catch (IOException | RuntimeException e) {
			// The browser closed the stream. The reply goes on and is stored; only the live copy is lost.
			clientGone = true;
		}
	}

}
