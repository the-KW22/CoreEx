package com.coreex.trash;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
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

@RestController
@RequestMapping(value = "/api/trash", produces = MediaType.APPLICATION_JSON_VALUE)
class TrashController {

	private static final int MAX_PAGE_SIZE = 100;

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record TrashEntryResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) TrashRepository.Kind kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "A Folder's name, or an Item's title (may be empty)") String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant deletedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Whole days left before it is removed for good") long daysRemaining,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Folders deleted with this Folder (0 for an Item)") long folderCount,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Items deleted with this Folder (0 for an Item)") long itemCount) {

		static TrashEntryResponse of(TrashService.Row row) {
			var e = row.entry();
			return new TrashEntryResponse(e.id(), e.kind(), e.title(), e.deletedAt(), row.daysRemaining(),
					e.folderCount(), e.itemCount());
		}

	}

	record TrashPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<TrashEntryResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final TrashService trash;

	TrashController(TrashService trash) {
		this.trash = trash;
	}

	/** What is in the Trash: Folders, and Items that were not deleted together with their Folder. Newest first. */
	@GetMapping
	TrashPage list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var rows = trash.list(user.id(), Math.max(0, page), safeSize).stream().map(TrashEntryResponse::of).toList();
		return new TrashPage(rows, trash.total(user.id()));
	}

	/** Brings an Item back, with any trashed Folders above it. */
	@PostMapping("/items/{id}/restore")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Restored")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: not in the User's Trash", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void restoreItem(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		trash.restoreItem(user.id(), id);
	}

	/** Brings a Folder back with everything that was deleted with it, and any trashed Folders above it. */
	@PostMapping("/folders/{id}/restore")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Restored")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: not in the User's Trash", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void restoreFolder(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		trash.restoreFolder(user.id(), id);
	}

	/** Removes a trashed Item for good, with its file. This cannot be undone. */
	@DeleteMapping("/items/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Deleted for good")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: not in the User's Trash", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code STORAGE_UNAVAILABLE: nothing was deleted", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void deleteItem(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		trash.deleteItemForGood(user.id(), id);
	}

	/** Removes a trashed Folder for good with everything that was deleted with it. This cannot be undone. */
	@DeleteMapping("/folders/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Deleted for good")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: not in the User's Trash", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code STORAGE_UNAVAILABLE: nothing was deleted", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void deleteFolder(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		trash.deleteFolderForGood(user.id(), id);
	}

	/** Removes everything in the User's Trash for good. This cannot be undone. */
	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "The Trash is empty")
	@ApiResponse(responseCode = "503", description = "Code STORAGE_UNAVAILABLE: nothing was deleted", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void empty(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		trash.empty(user.id());
	}

}
