package com.coreex.notes;

import java.time.Instant;
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
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(value = "/api/notes", produces = MediaType.APPLICATION_JSON_VALUE)
class NoteController {

	private static final int MAX_TITLE = 200;

	private static final int MAX_BODY = 1_000_000;

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	// Postgres cannot store a NUL character in text.
	private static final String NO_NUL = "[^\u0000]*";

	record CreateNoteRequest(@Size(max = MAX_TITLE) @Pattern(regexp = NO_NUL) String title,
			@Size(max = MAX_BODY) @Pattern(regexp = NO_NUL) String body,
			@Schema(nullable = true, description = "The Folder to create the Note in; null is the top level") UUID folderId) {
	}

	/** Carries the version the client last saw; a newer stored version means 409 VERSION_CONFLICT. */
	record SaveNoteRequest(@NotNull @Size(max = MAX_TITLE) @Pattern(regexp = NO_NUL) String title,
			@NotNull @Size(max = MAX_BODY) @Pattern(regexp = NO_NUL) String body, @NotNull Integer version) {
	}

	record NoteResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String body,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "The name of the Access token that made the latest change; null when the User did") String editedBy) {

		static NoteResponse of(Note note) {
			return new NoteResponse(note.id(), note.title(), note.body(), note.version(), note.folderId(),
					note.createdAt(), note.updatedAt(), note.editedBy());
		}

	}

	private final NoteService notes;

	NoteController(NoteService notes) {
		this.notes = notes;
	}

	@PostMapping(consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Note", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = NoteResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Folder", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	NoteResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateNoteRequest request) {
		return NoteResponse.of(notes.create(user.id(), request.folderId(), request.title(), request.body()));
	}

	@GetMapping("/{id}")
	@ApiResponse(responseCode = "200", description = "The Note", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = NoteResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Note)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	NoteResponse get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return NoteResponse.of(notes.get(user.id(), id));
	}

	@PutMapping(value = "/{id}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The saved Note, with its new version", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = NoteResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Note)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	NoteResponse save(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody SaveNoteRequest request) {
		return NoteResponse.of(notes.save(user.id(), id, request.title(), request.body(), request.version()));
	}

	/** Moves the Note to the Trash: it is hidden everywhere (the Trash screen comes later). */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Moved to the Trash")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Note)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void delete(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		notes.delete(user.id(), id);
	}

}
