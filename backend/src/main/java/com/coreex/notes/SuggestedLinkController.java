package com.coreex.notes;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
class SuggestedLinkController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	private final MentionService mentions;

	SuggestedLinkController(MentionService mentions) {
		this.mentions = mentions;
	}

	/** Link it: makes a Link in the Note to this Item, around a mention if there is one, or else at the end of the Note. */
	@PostMapping("/api/items/{id}/suggested-links/{noteId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Linked, or it already was")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also another User's)", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	void link(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID noteId) {
		mentions.addLink(user.id(), id, noteId);
	}

}
