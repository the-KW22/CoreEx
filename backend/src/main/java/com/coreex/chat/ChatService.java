package com.coreex.chat;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.coreex.ai.AiService;
import com.coreex.ai.Model;
import com.coreex.ai.Model.ContentBlock;
import com.coreex.common.ApiException;
import com.coreex.identity.User;
import com.coreex.search.SearchService;

/**
 * Chats belong to one User: every method takes the owner and answers 404 for anyone else's Chat, Admins included
 * (ADR 0004). A reply holds the Chat's claim until it ends, so one reply runs at a time per Chat.
 */
@Service
public class ChatService {

	/** How many pieces of the User's Notes are quoted up front for each message. */
	static final int UP_FRONT = 3;

	/** A Chat with its messages in order, and the sources of each turn by the id of its last assistant message. */
	public record Detail(Chat chat, List<ChatMessage> messages, Map<UUID, List<ChatSources.Source>> sources) {
	}

	private final ChatRepository chats;

	private final AiService ai;

	private final ChatTools tools;

	private final ChatProperties properties;

	private final Clock clock;

	private final SearchService search;

	private final ChatSources sources;

	private final ExecutorService replies = Executors.newVirtualThreadPerTaskExecutor();

	/**
	 * The replies running now, by Chat, so Stop and delete can reach them.
	 * shortcut: in memory, so Stop reaches a reply only on the API instance running it; move the stop flag to the database
	 * when there are several instances.
	 */
	private final Map<UUID, ChatReply> running = new ConcurrentHashMap<>();

	ChatService(ChatRepository chats, AiService ai, ChatTools tools, ChatProperties properties, Clock clock,
			SearchService search, ChatSources sources) {
		this.chats = chats;
		this.ai = ai;
		this.tools = tools;
		this.properties = properties;
		this.clock = clock;
		this.search = search;
		this.sources = sources;
	}

	public List<Chat> list(UUID owner) {
		return chats.list(owner);
	}

	public Chat create(UUID owner) {
		return chats.create(owner, clock.instant());
	}

	public Detail detail(UUID owner, UUID id) {
		var chat = require(owner, id);
		var messages = chats.messages(id);
		return new Detail(chat, messages, sources.byLastAssistant(owner, messages));
	}

	/** Deletes the Chat and its messages. A reply running in it is asked to stop first. */
	public void delete(UUID owner, UUID id) {
		require(owner, id);
		stopRunning(id);
		chats.delete(owner, id);
	}

	/** Asks the running reply to stop, keeping what it wrote. Nothing to do when nothing runs. */
	public void stop(UUID owner, UUID id) {
		require(owner, id);
		stopRunning(id);
	}

	Optional<ChatReply> running(UUID chatId) {
		return Optional.ofNullable(running.get(chatId));
	}

	/**
	 * Stores the User's message and starts the reply on the server, which streams its events to {@code out}. Refusals
	 * (AI off, budget spent, a reply already running, no such Chat) are thrown before anything is streamed. useNotes is the
	 * Use my Notes switch for this message; null keeps the one the Chat remembers. With Notes on, the closest pieces of the
	 * User's Notes are quoted with the message and stored with it.
	 */
	public void reply(User owner, UUID chatId, String text, Boolean useNotes, SseEmitter out) {
		var chat = require(owner.id(), chatId);
		ai.requireOn();
		ai.requireRoom(owner.id());
		var now = clock.instant();
		if (!chats.claim(owner.id(), chatId, now, now.minus(properties.staleClaim()))) {
			throw new ApiException(HttpStatus.CONFLICT, "CHAT_BUSY",
					"This Chat is still answering the last message. Wait for it, or press Stop.");
		}
		var notes = useNotes != null ? useNotes : chat.useNotes();
		var reply = new ChatReply(chats, ai, tools, properties, clock, owner, chatId, notes, sources, out);
		try {
			var first = !chats.hasMessages(chatId);
			var quotes = notes ? quotesFor(owner.id(), text) : List.<Quote>of();
			chats.addMessage(chatId, Model.Role.USER, List.of(new ContentBlock.Text(text)), "COMPLETE", null, quotes, now);
			if (useNotes != null) {
				chats.setUseNotes(chatId, useNotes);
			}
			if (first) {
				chats.setTitle(chatId, titleFrom(text));
			}
			chats.touch(chatId, now);
			running.put(chatId, reply);
			replies.execute(() -> reply.run(() -> finish(chatId, reply)));
		}
		catch (RuntimeException e) {
			running.remove(chatId, reply);
			chats.release(chatId);
			throw e;
		}
	}

	/** The closest pieces of the User's Notes to the message, above Semantic search's line: at most {@link #UP_FRONT}. */
	private List<Quote> quotesFor(UUID owner, String text) {
		return search.chunks(owner, text, UP_FRONT).stream()
				.map(c -> new Quote(c.id(), c.type(), c.title(), c.headingPath(), c.text())).toList();
	}

	private void finish(UUID chatId, ChatReply reply) {
		chats.release(chatId);
		running.remove(chatId, reply);
	}

	private void stopRunning(UUID chatId) {
		var reply = running.get(chatId);
		if (reply != null) {
			reply.requestStop();
		}
	}

	private Chat require(UUID owner, UUID id) {
		return chats.find(owner, id)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "That Chat does not exist."));
	}

	/** The first line of the first message, spaces collapsed and cut at sixty characters with an ellipsis. */
	static String titleFrom(String text) {
		var line = text.lines().findFirst().orElse("").strip().replaceAll("\\s+", " ");
		return line.length() > 60 ? line.substring(0, 60) + "…" : line;
	}

}
