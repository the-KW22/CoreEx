package com.coreex.resumes;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/cover-letters")
class CoverLetterController {

	record CreateCoverLetter(@NotBlank @Size(max = 200) @Pattern(regexp = "[^\\u0000]*") String title, UUID resumeId,
			@Valid CoverLetterDocument document) { }
	record SaveCoverLetter(@NotBlank @Size(max = 200) @Pattern(regexp = "[^\\u0000]*") String title, @NotNull Integer version,
			@NotNull @Valid CoverLetterDocument document) { }
	record UnlinkCoverLetter(@NotNull Integer version) { }
	record NameCoverLetterVersion(@NotBlank @Size(max = 120) @Pattern(regexp = "[^\\u0000]*") String name) { }
	record CoverLetterMarkdown(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String markdown,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version) { }
	record DraftCoverLetter(@NotNull UUID applicationId, @NotNull UUID resumeId, @NotNull Integer version,
			@NotNull CoverLetterDrafts.LetterDraftMode mode, UUID draftId) { }

	private final CoverLetterService letters;
	private final CoverLetterDrafts drafts;

	CoverLetterController(CoverLetterService letters, CoverLetterDrafts drafts) { this.letters = letters; this.drafts = drafts; }

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	CoverLetterService.Letter create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateCoverLetter request) {
		return letters.create(user.id(), request.title(), request.resumeId(), request.document());
	}

	@GetMapping
	List<CoverLetterService.Letter> list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return letters.list(user.id());
	}

	@GetMapping("/{id}")
	CoverLetterService.Letter get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) { return letters.get(user.id(), id); }

	@GetMapping("/{id}/markdown")
	CoverLetterMarkdown markdown(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		var letter = letters.get(user.id(), id);
		return new CoverLetterMarkdown(letter.document().markdown(), letter.version());
	}

	@GetMapping("/{id}/versions")
	List<CoverLetterService.CoverLetterVersion> versions(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) { return letters.versions(user.id(), id); }

	@GetMapping("/{id}/versions/{versionId}")
	CoverLetterService.CoverLetterVersion version(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID versionId) { return letters.version(user.id(), id, versionId); }

	@PostMapping("/{id}/versions")
	@ResponseStatus(HttpStatus.CREATED)
	CoverLetterService.CoverLetterVersion nameVersion(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody NameCoverLetterVersion request) { return letters.nameCurrent(user.id(), id, request.name()); }

	@PostMapping("/{id}/versions/{versionId}/restore")
	CoverLetterService.Letter restore(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID versionId, @Valid @RequestBody UnlinkCoverLetter request) {
		return letters.restore(user.id(), id, versionId, request.version());
	}

	@GetMapping("/{id}/drafts")
	List<CoverLetterDrafts.CoverLetterDraft> drafts(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) { return drafts.list(user.id(), id); }

	@PostMapping("/{id}/drafts")
	@ResponseStatus(HttpStatus.CREATED)
	CoverLetterDrafts.CoverLetterDraft draft(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody DraftCoverLetter request) {
		return drafts.make(user.id(), id, request.applicationId(), request.resumeId(), request.version(), request.mode(), request.draftId());
	}

	@PostMapping("/{id}/drafts/{draftId}/accept")
	CoverLetterService.Letter acceptDraft(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable UUID draftId, @Valid @RequestBody UnlinkCoverLetter request) {
		return drafts.accept(user.id(), id, draftId, request.version());
	}

	@PutMapping("/{id}")
	CoverLetterService.Letter save(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody SaveCoverLetter request) {
		return letters.save(user.id(), id, request.title(), request.version(), request.document());
	}

	@PostMapping("/{id}/unlink")
	CoverLetterService.Letter unlink(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody UnlinkCoverLetter request) { return letters.unlink(user.id(), id, request.version()); }

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void trash(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) { letters.trash(user.id(), id); }
}
