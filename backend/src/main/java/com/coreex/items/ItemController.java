package com.coreex.items;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
@RequestMapping(value = "/api/items", produces = MediaType.APPLICATION_JSON_VALUE)
class ItemController {

	private static final int MAX_PAGE_SIZE = 100;

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record ItemResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ItemResponse of(Item item) {
			return new ItemResponse(item.id(), item.type(), item.title(), item.folderId(), item.updatedAt());
		}

	}

	record ItemPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ItemResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	record MoveItemRequest(@Schema(nullable = true, description = "Null moves the Item to the top level") UUID folderId) {
	}

	private final ItemService items;

	ItemController(ItemService items) {
		this.items = items;
	}

	/** The signed-in User's live Items, most recently updated first; folderId limits them to one Folder. */
	@GetMapping
	@ApiResponse(responseCode = "200", description = "A page of Items", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ItemPage.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Folder", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ItemPage list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(required = false) UUID folderId, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "50") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var list = items.list(user.id(), folderId, Math.max(0, page), safeSize).stream().map(ItemResponse::of).toList();
		return new ItemPage(list, items.total(user.id(), folderId));
	}

	@PostMapping(value = "/{id}/move", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The moved Item", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ItemResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Item or Folder (also for another User's)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ItemResponse move(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @RequestBody MoveItemRequest request) {
		return ItemResponse.of(items.move(user.id(), id, request.folderId()));
	}

}
