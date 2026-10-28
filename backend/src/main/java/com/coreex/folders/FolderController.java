package com.coreex.folders;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(value = "/api/folders", produces = MediaType.APPLICATION_JSON_VALUE)
class FolderController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record CreateFolderRequest(@NotBlank @Size(max = 200) String name,
			@Schema(nullable = true, description = "Null puts the Folder at the top level") UUID parentId) {

		// Pasted names often carry spaces; trim before validation.
		CreateFolderRequest {
			name = name == null ? null : name.trim();
		}

	}

	record RenameFolderRequest(@NotBlank @Size(max = 200) String name) {

		RenameFolderRequest {
			name = name == null ? null : name.trim();
		}

	}

	record MoveFolderRequest(@Schema(nullable = true, description = "Null moves the Folder to the top level") UUID parentId) {
	}

	record FolderResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID parentId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name) {

		static FolderResponse of(Folder folder) {
			return new FolderResponse(folder.id(), folder.parentId(), folder.name());
		}

	}

	/** All live Folders as a flat list; the client builds the tree from parentId. */
	record FolderList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<FolderResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	record FolderSummary(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long folderCount,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long itemCount) {
	}

	private final FolderService folders;

	FolderController(FolderService folders) {
		this.folders = folders;
	}

	// shortcut: the Folder list is not paginated because the tree needs all of it, add a limit if someone has thousands.
	@GetMapping
	FolderList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		var items = folders.list(user.id()).stream().map(FolderResponse::of).toList();
		return new FolderList(items, items.size());
	}

	@PostMapping(consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Folder", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = FolderResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such parent Folder", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	FolderResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateFolderRequest request) {
		return FolderResponse.of(folders.create(user.id(), request.parentId(), request.name()));
	}

	@PutMapping(value = "/{id}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The renamed Folder", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = FolderResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Folder)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	FolderResponse rename(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody RenameFolderRequest request) {
		return FolderResponse.of(folders.rename(user.id(), id, request.name()));
	}

	@PostMapping(value = "/{id}/move", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The moved Folder", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = FolderResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Folder or target Folder",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code FOLDER_CYCLE", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	FolderResponse move(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @RequestBody MoveFolderRequest request) {
		return FolderResponse.of(folders.move(user.id(), id, request.parentId()));
	}

	/** What a delete would take with it, for the confirmation. */
	@GetMapping("/{id}/summary")
	@ApiResponse(responseCode = "200", description = "Counts of what the Folder holds", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = FolderSummary.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Folder)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	FolderSummary summary(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		var summary = folders.summary(user.id(), id);
		return new FolderSummary(summary.folderCount(), summary.itemCount());
	}

	/** Moves the Folder, its subfolders and their Items to the Trash under one batch. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Moved to the Trash")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Folder)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void delete(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		folders.delete(user.id(), id);
	}

}
