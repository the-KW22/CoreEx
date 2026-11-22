package com.coreex.chat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.coreex.ai.Model;
import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.items.Item;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The User's Chats. Every endpoint answers 404 for a Chat that is not the User's, Admins included. */
@RestController
@RequestMapping(value = "/api/chats", produces = MediaType.APPLICATION_JSON_VALUE)
class ChatController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	private static final String EVENT_STREAM = MediaType.TEXT_EVENT_STREAM_VALUE;

	private static final String REPLY_EVENTS = """
			The reply streams as Server-Sent Events. `text` carries a piece of the answer ({text}), `tool` a tool the model \
			is running ({name}), `done` ends the reply ({status}: COMPLETE or STOPPED, and {sources}: the Items the turn \
			used), and `error` ends it with a failure ({code}, {message}); the failure is also stored on the message. Refusals \
			come before the stream, as JSON: AI_OFF (503), AI_BUDGET_SPENT (429), CHAT_BUSY (409), NOT_FOUND (404).""";

	record SendRequest(@NotBlank @Size(max = 20_000) String text,
			@Schema(nullable = true, description = "The Use my Notes switch for this message; absent keeps the Chat's own setting")
			Boolean useNotes) {

		// Pasted text often carries spaces and line breaks at the ends; trim before validation.
		SendRequest {
			text = text == null ? null : text.strip();
		}

	}

	record ChatSummary(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant lastUsedAt) {
	}

	record ChatList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ChatSummary> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	record MessageView(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Model.Role role,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The content blocks: text, tool_use or tool_result")
			List<Model.ContentBlock> blocks,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "STREAMING, COMPLETE, STOPPED or FAILED")
			String status,
			@Schema(nullable = true, description = "Set when the status is FAILED, for example AI_UNAVAILABLE") String errorCode,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "On the last assistant message of a turn: the Items the turn used; empty elsewhere")
			List<SourceView> sources,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {
	}

	/** An Item a turn used: quoted up front or read by a tool. removed is true once it is in the Trash or gone. */
	record SourceView(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean removed) {
	}

	record ChatDetail(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant lastUsedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Use my Notes switch, as the Chat remembers it")
			boolean useNotes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<MessageView> messages) {
	}

	private final ChatService chats;

	private final ChatProperties properties;

	ChatController(ChatService chats, ChatProperties properties) {
		this.chats = chats;
		this.properties = properties;
	}

	@GetMapping
	@Operation(summary = "The User's Chats, most recently used first")
	ChatList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		var items = chats.list(user.id()).stream()
				.map(c -> new ChatSummary(c.id(), c.title(), c.createdAt(), c.lastUsedAt())).toList();
		return new ChatList(items, items.size());
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Starts an empty Chat in the general scope")
	@ApiResponse(responseCode = "201", description = "The new Chat, titled New chat")
	ChatDetail create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return detail(new ChatService.Detail(chats.create(user.id()), List.of(), Map.of()));
	}

	@GetMapping("/{id}")
	@Operation(summary = "One Chat with all its messages, in order")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Chat)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ChatDetail get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return detail(chats.detail(user.id(), id));
	}

	/** Hard delete: the Chat and its messages are gone, with no Trash. A reply running in it is stopped. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Deleted")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Chat)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void delete(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		chats.delete(user.id(), id);
	}

	/** Stores the message and streams the reply. Closing the stream does not stop the reply; Stop does. */
	@PostMapping(value = "/{id}/messages", consumes = JSON, produces = { EVENT_STREAM, JSON })
	@Operation(summary = "Sends a message and streams the reply", description = REPLY_EVENTS)
	@ApiResponse(responseCode = "200", description = "The reply as Server-Sent Events (text/event-stream)",
			content = @Content(mediaType = EVENT_STREAM, schema = @Schema(type = "string")))
	@ApiResponse(responseCode = "409", description = "Code CHAT_BUSY: a reply is still running in this Chat",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "429", description = "Code AI_BUDGET_SPENT: today's AI budget is used up",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code AI_OFF: AI is not switched on",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	SseEmitter send(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody SendRequest request) {
		var emitter = new SseEmitter(properties.maxReplyDuration().plusMinutes(1).toMillis());
		chats.reply(user, id, request.text(), request.useNotes(), emitter);
		return emitter;
	}

	/** Ends the running reply and keeps what it wrote. Harmless when nothing runs. */
	@PostMapping("/{id}/stop")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Stop asked (or nothing was running)")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Chat)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void stop(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		chats.stop(user.id(), id);
	}

	private static ChatDetail detail(ChatService.Detail detail) {
		var chat = detail.chat();
		var messages = detail.messages().stream()
				.map(m -> new MessageView(m.id(), m.role(), m.blocks(), m.status(), m.errorCode(),
						detail.sources().getOrDefault(m.id(), List.of()).stream()
								.map(s -> new SourceView(s.id(), s.type(), s.title(), s.removed())).toList(),
						m.createdAt()))
				.toList();
		return new ChatDetail(chat.id(), chat.title(), chat.createdAt(), chat.lastUsedAt(), chat.useNotes(), messages);
	}

}
