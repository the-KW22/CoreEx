package com.coreex.career;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
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

import com.coreex.career.ApplyService.Scope;
import com.coreex.career.CareerService.Question;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** An Application's Apply tab: the form's questions and answers, the answer library, and Mark as applied. */
@RestController
@RequestMapping("/api/applications/{id}/career")
class ApplyController {

	private static final String NO_NUL = "[^\u0000]*";

	record QuestionResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String question,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "WORDS or CHARS") String limitUnit,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Integer limitValue,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String answer,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The save counter; send it back when you save or accept") int version) {
	}

	record SentAnswerResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String question,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String answer,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) String limitUnit,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Integer limitValue,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int count) {
	}

	record SubmissionResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant sentAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<SentAnswerResponse> answers) {
	}

	record ApplyResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<QuestionResponse> questions,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What stops Mark as applied right now; empty once applied") List<String> blockers,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "What was sent, once marked as applied") SubmissionResponse submission) {
	}

	record SuggestionResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Scope scope,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String question,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String answer) {
	}

	record SuggestionsResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Best match first") List<SuggestionResponse> items) {
	}

	record AddQuestionRequest(@NotBlank @Size(max = 1000) @Pattern(regexp = NO_NUL) String question,
			@Schema(nullable = true) @Pattern(regexp = "WORDS|CHARS") String limitUnit, @Schema(nullable = true) Integer limitValue) {
	}

	record SaveQuestionRequest(@NotBlank @Size(max = 1000) @Pattern(regexp = NO_NUL) String question,
			@Schema(nullable = true) @Pattern(regexp = "WORDS|CHARS") String limitUnit, @Schema(nullable = true) Integer limitValue,
			@NotNull @Size(max = 20000) @Pattern(regexp = NO_NUL) String answer, @NotNull Integer version) {
	}

	record KeepRequest(@NotNull Scope scope) {
	}

	record ReuseRequest(@NotNull UUID libraryId, @NotNull Integer version) {
	}

	record KeptResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id) {
	}

	private final ApplyService apply;

	ApplyController(ApplyService apply) {
		this.apply = apply;
	}

	private static QuestionResponse respond(Question q) {
		return new QuestionResponse(q.id(), q.text(), q.limitUnit(), q.limitValue(), q.answer(), q.version());
	}

	private static SubmissionResponse respond(ApplyService.Submission s) {
		return s == null ? null : new SubmissionResponse(s.sentAt(), s.answers().stream()
				.map(a -> new SentAnswerResponse(a.question(), a.answer(), a.limitUnit(), a.limitValue(), a.count())).toList());
	}

	@GetMapping("/apply")
	ApplyResponse get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		var result = apply.apply(user.id(), id);
		return new ApplyResponse(result.questions().stream().map(ApplyController::respond).toList(), result.blockers(), respond(result.submission()));
	}

	@PostMapping("/questions")
	@ResponseStatus(HttpStatus.CREATED)
	QuestionResponse add(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@Valid @RequestBody AddQuestionRequest request) {
		return respond(apply.add(user.id(), id, request.question(), request.limitUnit(), request.limitValue()));
	}

	@PutMapping("/questions/{questionId}")
	QuestionResponse save(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID questionId, @Valid @RequestBody SaveQuestionRequest request) {
		return respond(apply.save(user.id(), id, questionId, request.question(), request.limitUnit(), request.limitValue(), request.answer(),
				request.version()));
	}

	@DeleteMapping("/questions/{questionId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID questionId) {
		apply.delete(user.id(), id, questionId);
	}

	/** Keeps the question's current answer in the answer library. */
	@PostMapping("/questions/{questionId}/library")
	@ResponseStatus(HttpStatus.CREATED)
	KeptResponse keep(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID questionId, @Valid @RequestBody KeepRequest request) {
		return new KeptResponse(apply.saveToLibrary(user.id(), id, questionId, request.scope()));
	}

	@GetMapping("/questions/{questionId}/suggestions")
	SuggestionsResponse suggestions(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID questionId) {
		return new SuggestionsResponse(apply.suggestions(user.id(), id, questionId).stream()
				.map(s -> new SuggestionResponse(s.id(), s.scope(), s.question(), s.answer())).toList());
	}

	/** Copies a library answer into the question; the copy is independent of the library. */
	@PostMapping("/questions/{questionId}/reuse")
	QuestionResponse reuse(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID questionId, @Valid @RequestBody ReuseRequest request) {
		return respond(apply.reuse(user.id(), id, questionId, request.libraryId(), request.version()));
	}

	@DeleteMapping("/library/{libraryId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeFromLibrary(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID libraryId) {
		apply.deleteFromLibrary(user.id(), id, libraryId);
	}

	/** Checks the answers and documents, moves the Application to Applied and records what was sent. */
	@PostMapping("/mark-applied")
	SubmissionResponse markApplied(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		return respond(apply.markApplied(user.id(), id));
	}

}
