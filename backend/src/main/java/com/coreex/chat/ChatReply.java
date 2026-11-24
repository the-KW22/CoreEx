package com.coreex.chat;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

import tools.jackson.databind.json.JsonMapper;

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

	/** Searches one reply may make in all (ADR 0009). */
	static final int WEB_SEARCHES = 5;

	/** Files attached to one model call, newest first: five files of 5 MB stay well under the provider's request limit. */
	private static final int MAX_ATTACHED = 3;

	private static final String GONE = "The file is no longer available.";

	private static final String EARLIER = "The file was read earlier and is not attached again. Read it again if you need it.";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** The provider's own web search and page reader, offered only while the User has the web switched on (ADR 0009). */
	static final List<Model.ToolSpec> WEB = List.of(
			new Model.ToolSpec("web_search", "Searches the web for pages that answer a question, up to five searches in a reply. "
					+ "Use it only when the answer needs the web, not the User's Notes.", Map.of("max_uses", WEB_SEARCHES), true),
			new Model.ToolSpec("web_fetch", "Reads a web page whose link appears in this conversation.", Map.of(), true));

	record TextEvent(String text) {
	}

	record ToolEvent(String name) {
	}

	/** The reply's status, the sources of the turn it finished, and the web pages it retrieved. */
	record DoneEvent(String status, List<ChatSources.Source> sources, List<Model.WebSource> webSources) {
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

	/** Which tools this reply may use, from the Chat's scope and switches: the offered ones and each call are checked against it. */
	private final ToolAccess access;

	/** The Use the web switch for this reply only: when on, the provider's web tools are offered. */
	private final boolean useWeb;

	private final ChatContext context;

	private final ChatSources sources;

	private final ChatAssets assets;

	/** The web pages the reply's model calls retrieved, at most {@link Model.WebSource#MAX}. */
	private List<Model.WebSource> webSources = List.of();

	/** The searches the reply has made so far: a reply may make 5 in all, however many model calls it takes. */
	private long searchesUsed;

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
			Clock clock, User owner, UUID chatId, ToolAccess access, boolean useWeb, ChatContext context, ChatSources sources,
			ChatAssets assets, SseEmitter out) {
		this.chats = chats;
		this.ai = ai;
		this.tools = tools;
		this.proposals = proposals;
		this.properties = properties;
		this.clock = clock;
		this.owner = owner;
		this.chatId = chatId;
		this.access = access;
		this.useWeb = useWeb;
		this.context = context;
		this.sources = sources;
		this.assets = assets;
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
			send("done", new DoneEvent(status, turnSources, webSources));
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
			if (toolSteps > 0 && !ai.available(owner.id())) {
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
					results.add(!access.allows(use.name(), use.input()) ? refused(use)
							: proposals.handles(use.name()) ? propose(use) : runTool(use));
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
			turn = ai.converse(owner.id(), ChatPrompt.forReply(context, useWeb, access.scope(), access.applicationId()), history, offered(), this::onText,
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
			if (!streamed.isEmpty()) {
				countAborted(history);
			}
			keepPartial(FAILED, failed.code);
			throw failed;
		}
		ai.record(owner.id(), turn.inputTokens(), turn.outputTokens(), turn.webSearches());
		searchesUsed += turn.webSearches();
		assistantBlocks = turn.blocks();
		chats.setMessage(assistantId, assistantBlocks, COMPLETE, null);
		var pages = Model.WebSource.keep(turn.webSources());
		if (!pages.isEmpty()) {
			chats.setWebSources(assistantId, pages);
			var all = new ArrayList<>(webSources);
			all.addAll(pages);
			webSources = Model.WebSource.keep(all);
		}
		return turn;
	}

	/**
	 * A call cut short reports no tokens, but the provider still bills it, so Stop must not be a way round the budget.
	 * shortcut: about 4 characters per token, counted from the history sent and the text received; upgrade if the
	 * provider's own count of an aborted call becomes available.
	 */
	private void countAborted(List<Model.Message> history) {
		ai.record(owner.id(), history.toString().length() / 4, streamed.length() / 4, 0);
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

	/** The tools the Chat's scope and switches allow: with Use my Notes off, only the question tool (and the Career ones, if on). */
	private List<Model.ToolSpec> offered() {
		var offered = new ArrayList<>(tools.specs().stream().filter(spec -> access.offers(spec.name())).toList());
		if (useWeb) {
			// The provider counts max_uses for each call, so what is left of the reply's 5 searches is passed on every call.
			var left = WEB_SEARCHES - searchesUsed;
			for (var spec : WEB) {
				if (!spec.name().equals("web_search")) {
					offered.add(spec);
				}
				else if (left > 0) {
					offered.add(new Model.ToolSpec(spec.name(), spec.description(), Map.of("max_uses", left), true));
				}
			}
		}
		return offered;
	}

	/** A read of an Asset (issue #204): its id and title as the result, with the file itself added on the next call (history). */
	private ContentBlock readAsset(ContentBlock.ToolUse use) {
		try {
			var file = assets.read(owner, use.input());
			var content = JSON.writeValueAsString(Map.of("id", file.id().toString(), "title", file.title(), "mediaType",
					file.mediaType(), "note", "The file is attached to this result."));
			return new ContentBlock.ToolResult(use.id(), content, false, file.id(), file.mediaType(), null);
		}
		catch (ApiException e) {
			return new ContentBlock.ToolResult(use.id(), e.getMessage(), true);
		}
		catch (RuntimeException e) {
			LOG.debug("A Chat file read failed");
			return new ContentBlock.ToolResult(use.id(), "The tool failed.", true);
		}
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
		if (ChatTools.READ_ASSET.equals(use.name())) {
			return readAsset(use);
		}
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

	/** The answer to a call that the Chat's scope or switches do not allow: it is not run and not proposed. */
	private static ContentBlock refused(ContentBlock.ToolUse use) {
		return new ContentBlock.ToolResult(use.id(), ToolAccess.REFUSED, true);
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
	 * is followed by the pieces quoted for it. A tool block is left out when the reply no longer offers its tool, since the
	 * provider wants every tool call it sees to be offered. A message with nothing left in it is skipped.
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
		// Only the newest few files are sent again with the history; older reads keep their words, not their bytes.
		var read = new ArrayList<String>();
		for (var row : rows) {
			for (var block : row.blocks()) {
				if (block instanceof ContentBlock.ToolResult result && result.assetId() != null) {
					read.add(result.toolUseId());
				}
			}
		}
		var attached = Set.copyOf(read.subList(Math.max(0, read.size() - MAX_ATTACHED), read.size()));
		var messages = new ArrayList<Model.Message>();
		for (var i = 0; i < rows.size(); i++) {
			var row = rows.get(i);
			var blocks = new ArrayList<ContentBlock>();
			for (var block : row.blocks()) {
				if (block instanceof ContentBlock.ToolUse || block instanceof ContentBlock.ToolResult) {
					if (!paired(block, i, useRow, resultRow) || !access.offers(toolName(block, toolNames))) {
						continue;
					}
					if (block instanceof ContentBlock.ToolResult result && result.assetId() != null) {
						// shortcut: the file is read again for every model call of the reply; upgrade by keeping the bytes for the reply's life.
						var file = attached.contains(result.toolUseId()) ? assets.reload(owner, result.assetId()) : Optional.<ChatAssets.File>empty();
						blocks.add(file.isEmpty() ? new ContentBlock.ToolResult(result.toolUseId(), attached.contains(result.toolUseId()) ? GONE : EARLIER, result.isError(), result.assetId(),
								result.mediaType(), null)
								: new ContentBlock.ToolResult(result.toolUseId(), DataMarkers.data(ChatTools.READ_ASSET, result.content()),
										result.isError(), result.assetId(), file.get().mediaType(), file.get().data()));
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

	/** The tool a tool call or its result belongs to; empty for any other block. */
	private static String toolName(ContentBlock block, Map<String, String> toolNames) {
		return switch (block) {
			case ContentBlock.ToolUse use -> use.name();
			case ContentBlock.ToolResult result -> toolNames.getOrDefault(result.toolUseId(), "");
			default -> "";
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
