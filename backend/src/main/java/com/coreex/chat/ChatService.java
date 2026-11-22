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

/**
 * Chats belong to one User: every method takes the owner and answers 404 for anyone else's Chat, Admins included
 * (ADR 0004). A reply holds the Chat's claim until it ends, so one reply runs at a time per Chat.
 */
@Service
public class ChatService {

	/** A Chat with its messages in order. */
	public record Detail(Chat chat, List<ChatMessage> messages) {
	}

	private final ChatRepository chats;

	private final AiService ai;

	private final ChatTools tools;

	private final ChatProperties properties;

	private final Clock clock;

	private final ExecutorService replies = Executors.newVirtualThreadPerTaskExecutor();

	/**
	 * The replies running now, by Chat, so Stop and delete can reach them.
	 * shortcut: in memory, so Stop reaches a reply only on the API instance running it; move the stop flag to the database
	 * when there are several instances.
	 */
	private final Map<UUID, ChatReply> running = new ConcurrentHashMap<>();

	ChatService(ChatRepository chats, AiService ai, ChatTools tools, ChatProperties properties, Clock clock) {
		this.chats = chats;
		this.ai = ai;
		this.tools = tools;
		this.properties = properties;
		this.clock = clock;
	}

	public List<Chat> list(UUID owner) {
		return chats.list(owner);
	}

	public Chat create(UUID owner) {
		return chats.create(owner, clock.instant());
	}

	public Detail detail(UUID owner, UUID id) {
		return new Detail(require(owner, id), chats.messages(id));
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
	 * (AI off, budget spent, a reply already running, no such Chat) are thrown before anything is streamed.
	 */
	public void reply(User owner, UUID chatId, String text, SseEmitter out) {
		require(owner.id(), chatId);
		ai.requireOn();
		ai.requireRoom(owner.id());
		var now = clock.instant();
		if (!chats.claim(owner.id(), chatId, now, now.minus(properties.staleClaim()))) {
			throw new ApiException(HttpStatus.CONFLICT, "CHAT_BUSY",
					"This Chat is still answering the last message. Wait for it, or press Stop.");
		}
		var reply = new ChatReply(chats, ai, tools, properties, clock, owner, chatId, out);
		try {
			var first = !chats.hasMessages(chatId);
			chats.addMessage(chatId, Model.Role.USER, List.of(new ContentBlock.Text(text)), "COMPLETE", null, now);
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
