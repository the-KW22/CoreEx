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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.resumes.ResumeRepository.Summary;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(value = "/api/resumes", produces = MediaType.APPLICATION_JSON_VALUE)
class ResumeController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	private static final int MAX_PAGE_SIZE = 100;

	// Postgres cannot store a NUL character in text.
	private static final String NO_NUL = "[^\u0000]*";

	record CreateResumeRequest(@Size(max = ResumeService.MAX_TITLE) @Pattern(regexp = NO_NUL) String title,
			@Schema(description = "Start from made-up sample content instead of a blank Resume") Boolean sample,
			@Schema(nullable = true, description = "An id you make up. Sending the same request again returns that Resume instead of making a second one; an id already used for anything else is refused with INVALID_REQUEST") UUID id) {
	}

	/** Carries the version the client last saw; a newer stored version means 409 VERSION_CONFLICT. */
	record SaveResumeRequest(@NotBlank @Size(max = ResumeService.MAX_TITLE) @Pattern(regexp = NO_NUL) String title,
			@NotNull @Valid ResumeDocument document, @NotNull Integer version) {
	}

	record RenameResumeRequest(@NotBlank @Size(max = ResumeService.MAX_TITLE) @Pattern(regexp = NO_NUL) String title) {
	}

	record ResumeResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) ResumeDocument document,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ResumeResponse of(Resume r) {
			return new ResumeResponse(r.id(), r.title(), r.document(), r.version(), r.folderId(), r.createdAt(),
					r.updatedAt());
		}

	}

	record ResumeSummary(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ResumeSummary of(Summary s) {
			return new ResumeSummary(s.id(), s.title(), s.folderId(), s.updatedAt());
		}

	}

	record ResumePage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ResumeSummary> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final ResumeService resumes;

	ResumeController(ResumeService resumes) {
		this.resumes = resumes;
	}

	@PostMapping(consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Resume", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ResumeResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ResumeResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateResumeRequest request) {
		return ResumeResponse.of(resumes.create(user.id(), request.id(), request.title(), Boolean.TRUE.equals(request.sample())).resume());
	}

	@GetMapping
	@ApiResponse(responseCode = "200", description = "A page of the User's Resumes, newest change first", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ResumePage.class)))
	ResumePage list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var listed = resumes.list(user.id(), Math.max(0, page), Math.min(MAX_PAGE_SIZE, Math.max(1, size)));
		return new ResumePage(listed.items().stream().map(ResumeSummary::of).toList(), listed.total());
	}

	@GetMapping("/{id}")
	@ApiResponse(responseCode = "200", description = "The Resume", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ResumeResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ResumeResponse get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return ResumeResponse.of(resumes.get(user.id(), id));
	}

	@PutMapping(value = "/{id}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The saved Resume, with its new version", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ResumeResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ResumeResponse save(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody SaveResumeRequest request) {
		return ResumeResponse.of(resumes.save(user.id(), id, request.title(), request.document(), request.version()));
	}

	/** Renames without the document, so the library can rename a Resume it has not opened. */
	@PutMapping(value = "/{id}/title", consumes = JSON)
	@ApiResponse(responseCode = "204", description = "Renamed")
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void rename(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody RenameResumeRequest request) {
		resumes.rename(user.id(), id, request.title());
	}

	@PostMapping("/{id}/duplicate")
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The copy, titled \"<title> (copy)\"", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ResumeResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ResumeResponse duplicate(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return ResumeResponse.of(resumes.duplicate(user.id(), id));
	}

}
