package com.coreex.notes;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping(value = "/api/items/{id}/mentions", produces = MediaType.APPLICATION_JSON_VALUE)
class MentionController {

	private static final int MAX_PAGE_SIZE = 50;

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record MentionResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Send this back to Link it") int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Plain text before the mention, never markup") String before,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The mention as written") String match,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Plain text after the mention") String after) {
	}

	record MentionList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<MentionResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	record LinkMentionRequest(@NotNull Integer version) {
	}

	private final MentionService mentions;

	MentionController(MentionService mentions) {
		this.mentions = mentions;
	}

	/** Notes that contain the Item's exact title and do not link to it. Titles under 3 characters list nothing. */
	@GetMapping
	@ApiResponse(responseCode = "200", description = "The mentions", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = MentionList.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's or a trashed Item)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	MentionList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @RequestParam(defaultValue = "10") int size) {
		var page = mentions.list(user.id(), id, Math.min(MAX_PAGE_SIZE, Math.max(1, size)));
		return new MentionList(page.items().stream()
				.map(m -> new MentionResponse(m.id(), m.title(), m.version(), m.before(), m.match(), m.after())).toList(),
				page.total());
	}

	/** Link it: wraps the first mention in the Note as a Link to this Item. */
	@PostMapping(value = "/{noteId}/link", consumes = JSON)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Linked")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also another User's, or no mention any more)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	void link(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID noteId, @Valid @RequestBody LinkMentionRequest request) {
		mentions.link(user.id(), id, noteId, request.version());
	}

}
