package com.coreex.resumes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.resumes.ResumeRepository.Summary;
import com.coreex.tags.TagColour;
import com.coreex.tags.TagService;

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

	record LockRequest(@NotNull Boolean locked) {
	}

	record ResumeMarkdown(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String markdown,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version) {
	}

	record ResumeResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) ResumeDocument document,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "A locked Resume cannot be saved or renamed until it is unlocked") boolean locked,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ResumeResponse of(Resume r) {
			return new ResumeResponse(r.id(), r.title(), r.document(), r.version(), r.locked(), r.folderId(), r.createdAt(),
					r.updatedAt());
		}

	}

	record ResumeSummary(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ResumeSummary of(Summary s) {
			return new ResumeSummary(s.id(), s.title(), s.folderId(), s.createdAt(), s.updatedAt());
		}

	}

	record ResumeTag(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name, @Schema(nullable = true) TagColour colour) {
	}

	record ResumePage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ResumeSummary> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Tags of each listed Resume, by its id; one without Tags is left out") Map<UUID, List<ResumeTag>> tags) {
	}

	private final ResumeService resumes;

	private final TagService tags;

	ResumeController(ResumeService resumes, TagService tags) {
		this.resumes = resumes;
		this.tags = tags;
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
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size,
			@Parameter(description = "Only Resumes whose title contains this, in any case") @RequestParam(defaultValue = "") String q,
			@Parameter(description = "updated (newest change first, the default), name or created (newest first)") @RequestParam(defaultValue = "updated") String sort) {
		var listed = resumes.list(user.id(), q, sort, Math.max(0, page), Math.min(MAX_PAGE_SIZE, Math.max(1, size)));
		var tagged = tags.forItems(user.id(), listed.items().stream().map(Summary::id).toList());
		var chips = new LinkedHashMap<UUID, List<ResumeTag>>();
		tagged.forEach((id, list) -> chips.put(id, list.stream().map(t -> new ResumeTag(t.id(), t.name(), t.colour())).toList()));
		return new ResumePage(listed.items().stream().map(ResumeSummary::of).toList(), listed.total(), chips);
	}

	/** Moves the Resume to the Trash, where Restore brings it back with its document unchanged. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Moved to the Trash")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void trash(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		resumes.trash(user.id(), id);
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

	@GetMapping("/{id}/markdown")
	@ApiResponse(responseCode = "200", description = "The Resume as Markdown and the version it was made from")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ResumeMarkdown markdown(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		var resume = resumes.get(user.id(), id);
		return new ResumeMarkdown(ResumeText.markdown(resume.document()), resume.version());
	}

	@PutMapping(value = "/{id}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The saved Resume, with its new version", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ResumeResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT, or RESUME_LOCKED when the Resume is locked", content = @Content(mediaType = JSON,
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

	@PutMapping(value = "/{id}/lock", consumes = JSON)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Locked or unlocked")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Resume)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void lock(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody LockRequest request) {
		resumes.setLocked(user.id(), id, request.locked());
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
