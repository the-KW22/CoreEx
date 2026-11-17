package com.coreex.career;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.career.CareerService.Stored;
import com.coreex.career.CareerService.Verdict;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** An Application's Career workspace: its AI results (the Library) and the Fit check. */
@RestController
@RequestMapping("/api/applications/{id}/career")
class CareerController {

	record EvidenceResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "FACT, STORY or RESUME") String kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String label) {
	}

	record RequirementResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String requirement,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Verdict verdict,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String note,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What shows it; a forgotten or switched-off Fact is left out") List<EvidenceResponse> evidence) {
	}

	record FitResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "An estimate from 0 to 100, never a measurement") int score,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String question,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<RequirementResponse> requirements) {
	}

	record ResultResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "FIT, DRAFT or TIGHTEN") String kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The posting, Knowledge or documents changed since it was made") boolean outOfDate,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a FIT result") FitResponse fit,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a DRAFT or TIGHTEN result") AnswerResponse answer,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "ACCEPTED or REJECTED; empty while it waits for the User") String resolution) {
	}

	record AnswerResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID questionId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String text,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What a Draft cites; empty for a Tighten") List<EvidenceResponse> evidence) {
	}

	record AcceptRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The version of the answer you saw") @NotNull Integer version) {
	}

	record Library(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Newest first") List<ResultResponse> results,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Sends: line of each task, by kind") Map<String, String> sends) {
	}

	private final CareerService career;

	CareerController(CareerService career) {
		this.career = career;
	}

	private ResultResponse respond(Stored stored, Map<UUID, CareerService.Evidence> evidence) {
		FitResponse fit = null;
		if (stored.fit() != null) {
			fit = new FitResponse(stored.fit().score(), stored.fit().question(), stored.fit().requirements().stream()
					.map(r -> new RequirementResponse(r.requirement(), r.verdict(), r.note(), evidence(r.evidence(), evidence))).toList());
		}
		var answer = stored.answer() == null ? null
				: new AnswerResponse(stored.answer().questionId(), stored.answer().text(), evidence(stored.answer().evidence(), evidence));
		return new ResultResponse(stored.id(), stored.kind(), stored.outOfDate(), stored.createdAt(), fit, answer, stored.resolution());
	}

	private static List<EvidenceResponse> evidence(List<UUID> ids, Map<UUID, CareerService.Evidence> known) {
		return ids.stream().filter(known::containsKey).map(id -> new EvidenceResponse(id, known.get(id).kind(), known.get(id).label())).toList();
	}

	private List<ResultResponse> respond(UUID owner, List<Stored> stored) {
		var ids = new LinkedHashSet<UUID>();
		stored.forEach(s -> {
			if (s.fit() != null) s.fit().requirements().forEach(r -> ids.addAll(r.evidence()));
			if (s.answer() != null) ids.addAll(s.answer().evidence());
		});
		var evidence = career.evidence(owner, ids);
		return stored.stream().map(s -> respond(s, evidence)).toList();
	}

	/** The Application's results, newest first, and what each task sends. */
	@GetMapping("/results")
	Library library(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		return new Library(respond(user.id(), career.results(user.id(), id)), career.sends());
	}

	/** Runs the Fit check; the result is kept in the Library. */
	@PostMapping("/fit")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse fit(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		return respond(user.id(), List.of(career.fit(user.id(), id))).get(0);
	}

	/** Drafts an answer to one form question; it waits in the Library until accepted or rejected. */
	@PostMapping("/questions/{questionId}/draft")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse draft(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID questionId) {
		return respond(user.id(), List.of(career.draft(user.id(), id, questionId))).get(0);
	}

	/** Shortens the question's answer; refused if the result is not shorter or goes over the limit. */
	@PostMapping("/questions/{questionId}/tighten")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse tighten(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID questionId) {
		return respond(user.id(), List.of(career.tighten(user.id(), id, questionId))).get(0);
	}

	/** Writes a Draft or Tighten result into its question's answer. */
	@PostMapping("/results/{resultId}/accept")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void accept(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID resultId, @Valid @RequestBody AcceptRequest request) {
		career.resolve(user.id(), id, resultId, true, request.version());
	}

	@PostMapping("/results/{resultId}/reject")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void reject(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID resultId) {
		career.resolve(user.id(), id, resultId, false, 0);
	}

}
