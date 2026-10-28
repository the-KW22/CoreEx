package com.coreex.items;

import java.util.List;
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

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.tags.Tag;
import com.coreex.tags.TagService;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The Tags on one Item. Lives here so that the tags feature never has to call the items feature. */
@RestController
@RequestMapping(value = "/api/items/{id}/tags", produces = MediaType.APPLICATION_JSON_VALUE)
class ItemTagController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record AddTagRequest(@NotBlank @Size(max = 50) @Pattern(regexp = "[^\\u0000]*") String name) {

		// Typed names often carry spaces; trim before validation.
		AddTagRequest {
			name = name == null ? null : name.trim();
		}

	}

	record ItemTagResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name) {

		static ItemTagResponse of(Tag tag) {
			return new ItemTagResponse(tag.id(), tag.name());
		}

	}

	record ItemTagList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ItemTagResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final ItemService items;

	private final TagService tags;

	ItemTagController(ItemService items, TagService tags) {
		this.items = items;
		this.tags = tags;
	}

	@GetMapping
	@ApiResponse(responseCode = "200", description = "The Item's Tags", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ItemTagList.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Item)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ItemTagList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		items.requireLive(user.id(), id);
		var list = tags.forItem(user.id(), id).stream().map(ItemTagResponse::of).toList();
		return new ItemTagList(list, list.size());
	}

	/** Adds the Tag with this name, matched ignoring case and created when the User has none. */
	@PostMapping(consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Tag now on the Item", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ItemTagResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Item)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ItemTagResponse add(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody AddTagRequest request) {
		items.requireLive(user.id(), id);
		return ItemTagResponse.of(tags.attach(user.id(), id, request.name()));
	}

	/** Takes the Tag off the Item; the Tag itself stays. */
	@DeleteMapping("/{tagId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "The Tag is no longer on the Item")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Item or Tag (also for another User's)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void remove(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID tagId) {
		items.requireLive(user.id(), id);
		tags.detach(user.id(), id, tagId);
	}

}
