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
import org.springframework.web.bind.annotation.RequestParam;
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
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** The User's Chats. Every endpoint answers 404 for a Chat that is not the User's, Admins included. */
@RestController
@RequestMapping(value = "/api/chats", produces = MediaType.APPLICATION_JSON_VALUE)
class ChatController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	private static final String EVENT_STREAM = MediaType.TEXT_EVENT_STREAM_VALUE;

	private static final String REPLY_EVENTS = """
			The reply streams as Server-Sent Events. `text` carries a piece of the answer ({text}), `tool` a tool the model \
			is running ({name}), `done` ends the reply ({status}: COMPLETE or STOPPED, {sources}: the Items the turn used, and \
			{webSources}: the web pages it retrieved), and `error` ends it with a failure ({code}, {message}); the failure is also stored on the message. Refusals \
			come before the stream, as JSON: AI_OFF (503), AI_BUDGET_SPENT (429), CHAT_BUSY (409), NOT_FOUND (404).""";

	record SendRequest(@NotBlank @Size(max = 20_000) String text,
			@Schema(nullable = true, description = "The Use my Notes switch for this message; absent keeps the Chat's own setting")
			Boolean useNotes,
			@Schema(nullable = true, description = "The Use the web switch for this message only, off when absent; never remembered")
			Boolean useWeb,
			@Valid @Schema(nullable = true, description = "Where the User is in CoreEx, for this reply only; never stored")
			ChatContext context) {

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
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The web pages the reply retrieved, http or https only; empty when none")
			List<Model.WebSource> webSources) {
	}

	/** An Item a turn used: quoted up front or read by a tool. removed is true once it is in the Trash or gone. */
	record SourceView(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean removed,
			@Schema(nullable = true, description = "The heading of the piece the model used, which the link opens the Note at") String heading) {
	}

	/** Where an applied Proposal's Note or Asset is. */
	record LinkView(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "NOTE or ASSET") String type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title) {
	}

	/** The words for an organising change on a Proposal's card: what it is about, where it is or its state, before and after. */
	record ChangeView(@Schema(nullable = true, description = "What the change is about, such as the Item's title") String subject,
			@Schema(nullable = true, description = "Where it is now or its state before") String before,
			@Schema(nullable = true, description = "Where it would be or its state after") String after) {
	}

	/** A change the model offered; it is applied only when the User approves it. */
	record ProposalView(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Chat it was made in: answer it there") UUID chatId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The reply that made it: Proposals with the same batch can be approved together") UUID batchId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The assistant message it was made in") UUID messageId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String tool,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What it would do, in words") String label,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "PENDING, APPLIED, REJECTED or REPLACED") String status,
			@Schema(nullable = true, description = "The Note's text now, for a Note edit") String before,
			@Schema(nullable = true, description = "The Note's text as it would be, for a Note tool; the User may edit it") String after,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The other inputs of the tool, for the card's details") Map<String, Object> details,
			@Schema(nullable = true, description = "The Note or Asset an applied Proposal made or changed") LinkView link,
			@Schema(nullable = true, description = "The words for an organising change (move, Tags, Trash, rename); null for a Note or a create") ChangeView change,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {
	}

	record ProposalList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ProposalView> items) {
	}

	/** Approves or rejects Proposals; a batch is approved all or nothing. */
	record AnswerProposalsRequest(@NotEmpty @Size(max = 50) List<UUID> ids,
			@NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "APPROVE or REJECT") Decision decision,
			@Schema(nullable = true, description = "The User's own text for a Note Proposal, by its id, saved in place of the model's") Map<UUID, @Size(max = 1_000_000) String> edits) {
	}

	enum Decision {
		APPROVE, REJECT
	}

	/** The answer to the question a reply ended on. */
	record AnswerQuestionRequest(@NotBlank @Size(max = 200) String toolUseId, @NotBlank @Size(max = 20_000) String text) {

		AnswerQuestionRequest {
			text = text == null ? null : text.strip();
		}

	}

	record ChatDetail(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant lastUsedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Use my Notes switch, as the Chat remembers it")
			boolean useNotes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<MessageView> messages,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Proposals of the Chat, oldest first") List<ProposalView> proposals) {
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
	@ApiResponse(responseCode = "201", description = "The new Chat, titled New chat",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ChatDetail.class)))
	ChatDetail create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return detail(new ChatService.Detail(chats.create(user.id()), List.of(), Map.of(), List.of()));
	}

	@GetMapping("/{id}")
	@Operation(summary = "One Chat with all its messages, in order")
	@ApiResponse(responseCode = "200", description = "The Chat",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ChatDetail.class)))
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
		chats.reply(user, id, request.text(), request.useNotes(), request.useWeb(), request.context(), emitter);
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

	/** The pending Proposals for one Note across the User's Chats, so the Note's page can show and answer them. */
	@GetMapping("/proposals")
	@Operation(summary = "The pending Proposals for one Note, across the User's Chats, oldest first")
	@ApiResponse(responseCode = "200", description = "The Proposals; answer each in its chatId, with the answer endpoint",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ProposalList.class)))
	ProposalList pendingForNote(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam @Parameter(description = "The Note's id") UUID noteId) {
		return new ProposalList(chats.pendingForNote(user.id(), noteId).stream().map(ChatController::view).toList());
	}

	/** Approves or rejects Proposals of this Chat. Approving a batch applies all of them or none. */
	@PostMapping(value = "/{id}/proposals/answer", consumes = JSON)
	@Operation(summary = "Approves or rejects Proposals")
	@ApiResponse(responseCode = "200", description = "The Proposals as they are now",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ProposalList.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Chat or Proposal (also for another User's)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code ALREADY_ANSWERED, CHAT_BUSY (a reply is running) or VERSION_CONFLICT (the Note changed since: ask Chat to redo it); nothing was applied",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ProposalList answerProposals(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody AnswerProposalsRequest request) {
		var answered = chats.answerProposals(user, id, request.ids(), request.decision() == Decision.APPROVE, request.edits());
		return new ProposalList(answered.stream().map(ChatController::view).toList());
	}

	/** Answers the question the last reply ended on; the reply continues and streams like a sent message. */
	@PostMapping(value = "/{id}/answer", consumes = JSON, produces = { EVENT_STREAM, JSON })
	@Operation(summary = "Answers the model's question and streams the rest of the reply", description = REPLY_EVENTS)
	@ApiResponse(responseCode = "200", description = "The reply as Server-Sent Events (text/event-stream)",
			content = @Content(mediaType = EVENT_STREAM, schema = @Schema(type = "string")))
	@ApiResponse(responseCode = "409", description = "Code NO_PENDING_QUESTION or CHAT_BUSY",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	SseEmitter answer(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody AnswerQuestionRequest request) {
		var emitter = new SseEmitter(properties.maxReplyDuration().plusMinutes(1).toMillis());
		chats.answerQuestion(user, id, request.toolUseId(), request.text(), emitter);
		return emitter;
	}

	private static ProposalView view(Proposal p) {
		var details = new java.util.LinkedHashMap<String, Object>(p.input());
		details.keySet().removeAll(java.util.Set.of("markdown", "edits"));
		var link = ChatProposals.link(p).map(l -> new LinkView(l.id(), l.type(), l.title())).orElse(null);
		var change = p.changeSubject() == null && p.changeBefore() == null && p.changeAfter() == null ? null
				: new ChangeView(p.changeSubject(), p.changeBefore(), p.changeAfter());
		return new ProposalView(p.id(), p.chatId(), p.batchId(), p.messageId(), p.tool(), p.label(), p.status(), p.before(),
				p.after(), details, link, change, p.createdAt());
	}

	private static ChatDetail detail(ChatService.Detail detail) {
		var chat = detail.chat();
		var messages = detail.messages().stream()
				.map(m -> new MessageView(m.id(), m.role(), m.blocks(), m.status(), m.errorCode(),
						detail.sources().getOrDefault(m.id(), List.of()).stream()
								.map(s -> new SourceView(s.id(), s.type(), s.title(), s.removed(), s.heading())).toList(),
						m.createdAt(), m.webSources()))
				.toList();
		return new ChatDetail(chat.id(), chat.title(), chat.createdAt(), chat.lastUsedAt(), chat.useNotes(), messages,
				detail.proposals().stream().map(ChatController::view).toList());
	}

}
