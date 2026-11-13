package com.coreex.notes;

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
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.notes.NoteController.NoteResponse;
import com.coreex.notes.NoteVersionRepository.NoteVersion;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** The earlier texts of a Note: what each save replaced, newest first, to read and to bring back. */
@RestController
@RequestMapping(value = "/api/notes/{id}/versions", produces = MediaType.APPLICATION_JSON_VALUE)
class NoteVersionController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record VersionSummary(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "When this text was written") Instant savedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "The name of the Access token that wrote this text; null when the User did") String editedBy,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int sizeBytes) {

		static VersionSummary of(NoteVersion v) {
			return new VersionSummary(v.id(), v.title(), v.savedAt(), v.editedBy(), v.sizeBytes());
		}

	}

	record VersionList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<VersionSummary> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int total) {
	}

	record VersionDetail(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String body,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant savedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) String editedBy) {
	}

	/** The version of the Note the caller last saw; a newer stored version means 409 VERSION_CONFLICT. */
	record RestoreRequest(@NotNull Integer version) {
	}

	private final NoteService notes;

	NoteVersionController(NoteService notes) {
		this.notes = notes;
	}

	@GetMapping
	@ApiResponse(responseCode = "200", description = "The Note's versions, newest first, without their text",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = VersionList.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Note)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	VersionList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		var items = notes.versions(user.id(), id).stream().map(VersionSummary::of).toList();
		return new VersionList(items, items.size());
	}

	@GetMapping("/{versionId}")
	@ApiResponse(responseCode = "200", description = "One version, with its text",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = VersionDetail.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Note)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	VersionDetail get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID versionId) {
		var v = notes.version(user.id(), id, versionId);
		return new VersionDetail(v.id(), v.title(), v.body(), v.savedAt(), v.editedBy());
	}

	@PostMapping(value = "/{versionId}/restore", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Note, saved with the earlier text and a new version",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = NoteResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Note)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	NoteResponse restore(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID versionId, @Valid @RequestBody RestoreRequest request) {
		return NoteResponse.of(notes.restore(user.id(), id, versionId, request.version()));
	}

}
