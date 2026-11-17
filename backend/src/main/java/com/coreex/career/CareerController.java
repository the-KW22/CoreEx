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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.career.CareerService.Stored;
import com.coreex.career.CareerService.Verdict;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

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
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "FIT") String kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The posting, Knowledge or documents changed since it was made") boolean outOfDate,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a FIT result") FitResponse fit) {
	}

	record Library(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Newest first") List<ResultResponse> results,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Sends: line of each task, by kind") Map<String, String> sends) {
	}

	private final CareerService career;

	CareerController(CareerService career) {
		this.career = career;
	}

	private ResultResponse respond(Stored stored, Map<UUID, CareerService.Evidence> evidence) {
		var fit = new FitResponse(stored.fit().score(), stored.fit().question(), stored.fit().requirements().stream()
				.map(r -> new RequirementResponse(r.requirement(), r.verdict(), r.note(), r.evidence().stream()
						.filter(evidence::containsKey).map(id -> new EvidenceResponse(id, evidence.get(id).kind(), evidence.get(id).label())).toList()))
				.toList());
		return new ResultResponse(stored.id(), stored.kind(), stored.outOfDate(), stored.createdAt(), fit);
	}

	private List<ResultResponse> respond(UUID owner, List<Stored> stored) {
		var ids = new LinkedHashSet<UUID>();
		stored.forEach(s -> s.fit().requirements().forEach(r -> ids.addAll(r.evidence())));
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

}
