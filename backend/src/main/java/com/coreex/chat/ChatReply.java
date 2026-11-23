package com.coreex.chat;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

	static final String BUDGET_SPENT = "Daily budget used up. It starts again at midnight UTC.";

	static final String SWITCHED_OFF = "Chat was switched off, so the reply stopped here.";

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

	private final ChatProposals proposals;

	/** The Proposals this reply makes belong to one batch, so the User can approve them together. */
	private final UUID batch = UUID.randomUUID();

	private final ChatProperties properties;

	private final Clock clock;

	private final User owner;

	private final UUID chatId;

	/** The Use my Notes switch for this reply: when off, no tools are offered and the tool blocks are not replayed. */
	private final boolean useNotes;

	private final ChatContext context;

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

	ChatReply(ChatRepository chats, AiService ai, ChatTools tools, ChatProposals proposals, ChatProperties properties,
			Clock clock, User owner, UUID chatId, boolean useNotes, ChatContext context, ChatSources sources, SseEmitter out) {
		this.chats = chats;
		this.ai = ai;
		this.tools = tools;
		this.proposals = proposals;
		this.properties = properties;
		this.clock = clock;
		this.owner = owner;
		this.chatId = chatId;
		this.useNotes = useNotes;
		this.context = context;
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
			// Counted down even when the release fails, so the stream still ends with its last event below.
			try {
				release.run();
			}
			catch (RuntimeException e) {
				LOG.warn("A Chat's claim could not be released: {}", e.getClass().getSimpleName());
			}
			finally {
				ended.countDown();
			}
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
				addNote(TIME_LIMIT);
				return COMPLETE;
			}
			if (toolSteps > 0 && !ai.available()) {
				// An Admin's switch is for emergencies: it ends a reply that is already running, not only new ones.
				addNote(SWITCHED_OFF);
				return COMPLETE;
			}
			if (toolSteps > 0 && budgetSpent()) {
				addNote(BUDGET_SPENT);
				return COMPLETE;
			}
			var turn = callModel();
			if (turn.stopReason() != Model.StopReason.TOOL_USE) {
				return COMPLETE;
			}
			// A question ends the reply: its card waits for the answer, which continues the conversation (issue #376).
			if (turn.blocks().stream().anyMatch(b -> b instanceof ContentBlock.ToolUse use && ChatTools.ASK.equals(use.name()))) {
				return COMPLETE;
			}
			var results = new ArrayList<ContentBlock>();
			for (var block : turn.blocks()) {
				if (block instanceof ContentBlock.ToolUse use) {
					send("tool", new ToolEvent(use.name()));
					results.add(useNotes && proposals.handles(use.name()) ? propose(use) : runTool(use));
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
			turn = ai.converse(ChatPrompt.forReply(context), history, offered(), this::onText, properties.maxOutputTokens());
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
			if (!streamed.isEmpty()) {
				countAborted(history);
			}
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

	/** With Use my Notes off nothing of the knowledge base is offered, but the model can still ask a question. */
	private List<Model.ToolSpec> offered() {
		return useNotes ? tools.specs() : tools.specs().stream().filter(spec -> ChatTools.ASK.equals(spec.name())).toList();
	}

	/** A write tool is not run: it becomes a Proposal the User answers, and the model is told it waits. */
	private ContentBlock propose(ContentBlock.ToolUse use) {
		try {
			return new ContentBlock.ToolResult(use.id(), proposals.propose(owner, chatId, assistantId, batch, use), false);
		}
		catch (ApiException e) {
			return new ContentBlock.ToolResult(use.id(), e.getMessage(), true);
		}
		catch (RuntimeException e) {
			LOG.debug("A Chat proposal failed: {}", use.name());
			return new ContentBlock.ToolResult(use.id(), "The proposal could not be made.", true);
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

	private void addNote(String note) {
		assistantBlocks = append(assistantBlocks, new ContentBlock.Text(note));
		chats.setMessage(assistantId, assistantBlocks, COMPLETE, null);
	}

	/** Whether today's budget is used up. Asked before each call after the first, since one reply can run many. */
	private boolean budgetSpent() {
		try {
			ai.requireRoom(owner.id());
			return false;
		}
		catch (ApiException e) {
			return true;
		}
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
		var useRow = new HashMap<String, Integer>();
		var resultRow = new HashMap<String, Integer>();
		for (var i = 0; i < rows.size(); i++) {
			for (var block : rows.get(i).blocks()) {
				if (block instanceof ContentBlock.ToolUse use) {
					toolNames.put(use.id(), use.name());
					useRow.putIfAbsent(use.id(), i);
				}
				else if (block instanceof ContentBlock.ToolResult result) {
					resultRow.putIfAbsent(result.toolUseId(), i);
				}
			}
		}
		var messages = new ArrayList<Model.Message>();
		for (var i = 0; i < rows.size(); i++) {
			var row = rows.get(i);
			var blocks = new ArrayList<ContentBlock>();
			for (var block : row.blocks()) {
				if (block instanceof ContentBlock.ToolUse || block instanceof ContentBlock.ToolResult) {
					if (!paired(block, i, useRow, resultRow) || (!useNotes && !isQuestion(block, toolNames))) {
						continue;
					}
					if (block instanceof ContentBlock.ToolResult result) {
						var tool = toolNames.getOrDefault(result.toolUseId(), "unknown");
						// The User's own answer to a question is theirs, not data from a tool.
						var content = ChatTools.ASK.equals(tool) ? result.content() : DataMarkers.data(tool, result.content());
						blocks.add(new ContentBlock.ToolResult(result.toolUseId(), content, result.isError()));
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

	/**
	 * A tool call needs its result in a later row and a result needs its call in an earlier one. A broken pair (a crash
	 * between the two writes, or a call cut short) is left out, so the provider never sees an unanswered call.
	 */
	private static boolean paired(ContentBlock block, int row, Map<String, Integer> useRow, Map<String, Integer> resultRow) {
		return switch (block) {
			case ContentBlock.ToolUse use -> resultRow.getOrDefault(use.id(), -1) > row;
			case ContentBlock.ToolResult result -> useRow.getOrDefault(result.toolUseId(), Integer.MAX_VALUE) < row;
			default -> true;
		};
	}

	/** The question tool is not about the knowledge base, so it stays in the history when Use my Notes is off. */
	private static boolean isQuestion(ContentBlock block, Map<String, String> toolNames) {
		return switch (block) {
			case ContentBlock.ToolUse use -> ChatTools.ASK.equals(use.name());
			case ContentBlock.ToolResult result -> ChatTools.ASK.equals(toolNames.get(result.toolUseId()));
			default -> false;
		};
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
