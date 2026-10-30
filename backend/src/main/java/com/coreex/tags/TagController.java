package com.coreex.tags;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(value = "/api/tags", produces = MediaType.APPLICATION_JSON_VALUE)
class TagController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record RenameTagRequest(@NotBlank @Size(max = 50) @Pattern(regexp = "[^\\u0000]*") String name) {

		// Typed names often carry spaces; trim before validation.
		RenameTagRequest {
			name = name == null ? null : name.trim();
		}

	}

	/** A null colour means automatic. */
	record ColourRequest(@Pattern(regexp = "gray|red|orange|yellow|green|teal|blue|pink") @Schema(nullable = true,
			allowableValues = {"gray", "red", "orange", "yellow", "green", "teal", "blue", "pink"}) String colour) {
	}

	record TagResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
			@Schema(nullable = true, allowableValues = {"gray", "red", "orange", "yellow", "green", "teal", "blue", "pink"}) String colour) {
	}

	record TagCountResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
			@Schema(nullable = true, allowableValues = {"gray", "red", "orange", "yellow", "green", "teal", "blue", "pink"}) String colour,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Live Items with this Tag") long itemCount) {
	}

	/** All of the User's Tags; the Tags view and autocomplete need all of them. */
	record TagList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<TagCountResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final TagService tags;

	TagController(TagService tags) {
		this.tags = tags;
	}

	// shortcut: the Tag list is not paginated because autocomplete needs all of it, add a limit if someone has thousands.
	@GetMapping
	TagList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		var items = tags.list(user.id()).stream()
				.map(t -> new TagCountResponse(t.id(), t.name(), t.colour(), t.itemCount())).toList();
		return new TagList(items, items.size());
	}

	@PutMapping(value = "/{id}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The renamed Tag", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = TagResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Tag)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code TAG_EXISTS: the User already has a Tag with this name",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	TagResponse rename(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody RenameTagRequest request) {
		var tag = tags.rename(user.id(), id, request.name());
		return new TagResponse(tag.id(), tag.name(), tag.colour());
	}

	@PutMapping(value = "/{id}/colour", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Tag with its new colour", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = TagResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST: not one of the colour names",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Tag)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	TagResponse colour(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody ColourRequest request) {
		var tag = tags.setColour(user.id(), id, request.colour());
		return new TagResponse(tag.id(), tag.name(), tag.colour());
	}

	/** Deletes the Tag from every Item. The Items are not touched. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Deleted")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Tag)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void delete(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		tags.delete(user.id(), id);
	}

}
