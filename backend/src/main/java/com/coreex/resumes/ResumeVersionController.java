package com.coreex.resumes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import com.coreex.resumes.ResumeController.ResumeResponse;
import com.coreex.resumes.ResumeVersionRepository.Version;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** A Resume's history: the documents its saves replaced, and the ones the User named. */
@RestController
@RequestMapping(value = "/api/resumes/{id}/versions", produces = MediaType.APPLICATION_JSON_VALUE)
class ResumeVersionController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	// Postgres cannot store a NUL character in text.
	private static final String NO_NUL = "[^\u0000]*";

	record NameResumeVersionRequest(@NotBlank @Size(max = 120) @Pattern(regexp = NO_NUL) String name) {
	}

	record RenameResumeVersionRequest(@Size(max = 120) @Pattern(regexp = NO_NUL) String name) {
	}

	record RestoreResumeRequest(@NotNull Integer version) {
	}

	record ResumeVersionSummary(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The name the User gave it; a named version is never cleaned up") String name,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int sizeBytes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The name of the Access token that wrote it; null when the User did") String editedBy,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "When the document was written, not when it was kept") Instant savedAt) {

		static ResumeVersionSummary of(Version v) {
			return new ResumeVersionSummary(v.id(), v.title(), v.name(), v.sizeBytes(), v.editedBy(), v.savedAt());
		}

	}

	record ResumeVersionResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) String name,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) ResumeDocument document,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) String editedBy,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant savedAt) {
	}

	record ResumeVersionList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ResumeVersionSummary> items) {
	}

	private final ResumeService resumes;

	ResumeVersionController(ResumeService resumes) {
		this.resumes = resumes;
	}

	@GetMapping
	@ApiResponse(responseCode = "200", description = "The Resume's versions, newest first, without their documents", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ResumeVersionList.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ResumeVersionList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return new ResumeVersionList(resumes.versions(user.id(), id).stream().map(ResumeVersionSummary::of).toList());
	}

	@GetMapping("/{versionId}")
	@ApiResponse(responseCode = "200", description = "One version with its document", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ResumeVersionResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ResumeVersionResponse get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID versionId) {
		var v = resumes.version(user.id(), id, versionId);
		return new ResumeVersionResponse(v.id(), v.title(), v.name(), v.document(), v.editedBy(), v.savedAt());
	}

	/** Keeps the Resume as it is now under a name. */
	@PostMapping(consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The named version", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ResumeVersionSummary.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ResumeVersionSummary name(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody NameResumeVersionRequest request) {
		return ResumeVersionSummary.of(resumes.nameCurrent(user.id(), id, request.name()));
	}

	/** Names a version, or clears its name with a blank one. */
	@PutMapping(value = "/{versionId}/name", consumes = JSON)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Named, or the name cleared")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	void rename(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID versionId, @Valid @RequestBody RenameResumeVersionRequest request) {
		resumes.renameVersion(user.id(), id, versionId, request.name());
	}

	/** Saves that version as the Resume. The document it replaces is kept first. */
	@PostMapping(value = "/{versionId}/restore", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The restored Resume, with its new version", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ResumeResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT, or RESUME_LOCKED when the Resume is locked", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ResumeResponse restore(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID versionId, @Valid @RequestBody RestoreResumeRequest request) {
		return ResumeResponse.of(resumes.restore(user.id(), id, versionId, request.version()));
	}

}
