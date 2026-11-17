package com.coreex.knowledge;

import java.math.BigDecimal;
import java.time.Instant;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.knowledge.KnowledgeService.Candidate;
import com.coreex.knowledge.KnowledgeService.FactView;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Career Knowledge: Facts, Story Notes and Preferences. Every call is scoped to the authenticated User. */
@RestController
@RequestMapping(value = "/api/knowledge", produces = MediaType.APPLICATION_JSON_VALUE)
class KnowledgeController {

	// Postgres cannot store a NUL character in text.
	private static final String NO_NUL = "[^\u0000]*";

	private static final String CATEGORY = "EXPERIENCE|SKILL|ACHIEVEMENT|EDUCATION|OTHER";

	record FactRequest(@NotBlank @Size(max = 2000) @Pattern(regexp = NO_NUL) String text,
			@NotNull @Pattern(regexp = CATEGORY) String category) {
	}

	record CreateFactRequest(@NotBlank @Size(max = 2000) @Pattern(regexp = NO_NUL) String text,
			@NotNull @Pattern(regexp = CATEGORY) String category,
			@Schema(nullable = true, description = "MANUAL (the default), RESUME or NOTE") @Pattern(regexp = "MANUAL|RESUME|NOTE") String sourceKind,
			@Schema(nullable = true) UUID sourceId,
			@Schema(nullable = true, description = "The exact words of the source; checked against its current text") @Size(max = 2000) @Pattern(regexp = NO_NUL) String quote) {
	}

	record StatusRequest(@NotNull @Pattern(regexp = "ACTIVE|OFF") String status) {
	}

	record StoryRequest(@Size(max = 200) @Pattern(regexp = NO_NUL) String title) {
	}

	record StoryFlagRequest(@NotNull Boolean story) {
	}

	record PreferencesRequest(@Size(max = 500) @Pattern(regexp = NO_NUL) String targetRoles,
			@Schema(nullable = true, description = "Any of REMOTE, HYBRID, ONSITE") List<String> places,
			@Schema(nullable = true) @DecimalMin("0") BigDecimal minBasePay,
			@Schema(nullable = true, description = "Three letters, such as GBP") @Pattern(regexp = "[A-Z]{3}") String currency,
			@Schema(nullable = true) @Pattern(regexp = "YEAR|MONTH|HOUR") String payPeriod,
			@Schema(nullable = true) @Min(0) @Max(7) Integer officeDaysPerWeek,
			@Size(max = 100) @Pattern(regexp = NO_NUL) String noticePeriod) {
	}

	record RevisionResponse(String text, Instant savedAt) {
	}

	record FactResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String text,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String category,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String sourceKind,
			@Schema(nullable = true) UUID sourceId,
			@Schema(nullable = true) String quote,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Earlier wordings, oldest first") List<RevisionResponse> revisions) {

		static FactResponse of(FactView view) {
			var f = view.fact();
			return new FactResponse(f.id(), f.text(), f.category(), f.sourceKind(), f.sourceId(), f.quote(), f.status(),
					f.updatedAt(), view.revisions().stream().map(r -> new RevisionResponse(r.text(), r.savedAt())).toList());
		}
	}

	record CandidateResponse(String sourceKind, UUID sourceId, String quote) {
		static CandidateResponse of(Candidate c) {
			return new CandidateResponse(c.sourceKind(), c.sourceId(), c.quote());
		}
	}

	record StoryResponse(UUID id, String title, Instant updatedAt) {
	}

	record StoryCreatedResponse(UUID id, String title, String body) {
	}

	record PreferencesResponse(String targetRoles, List<String> places, BigDecimal minBasePay, String currency, String payPeriod,
			Integer officeDaysPerWeek, String noticePeriod) {
	}

	private final KnowledgeService knowledge;

	KnowledgeController(KnowledgeService knowledge) {
		this.knowledge = knowledge;
	}

	@GetMapping("/facts")
	List<FactResponse> facts(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(required = false) String category, @RequestParam(required = false) String status) {
		return knowledge.facts(user.id(), category, status).stream().map(FactResponse::of).toList();
	}

	@PostMapping(value = "/facts", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	FactResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateFactRequest request) {
		var kind = request.sourceKind() == null ? "MANUAL" : request.sourceKind();
		return FactResponse.of(knowledge.create(user.id(), request.text(), request.category(), kind, request.sourceId(),
				request.quote()));
	}

	/** Lines of a Resume or Note that could become Facts, without the ones already taken or forgotten. */
	@GetMapping("/facts/candidates")
	List<CandidateResponse> candidates(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam String sourceKind, @RequestParam UUID sourceId) {
		return knowledge.candidates(user.id(), sourceKind, sourceId).stream().map(CandidateResponse::of).toList();
	}

	@PutMapping(value = "/facts/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
	FactResponse correct(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody FactRequest request) {
		return FactResponse.of(knowledge.correct(user.id(), id, request.text(), request.category()));
	}

	@PutMapping(value = "/facts/{id}/status", consumes = MediaType.APPLICATION_JSON_VALUE)
	FactResponse status(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody StatusRequest request) {
		return FactResponse.of(knowledge.setStatus(user.id(), id, request.status()));
	}

	/** Forget for good: the text and its revisions are removed; a pulled Fact's source is blocked from coming back. */
	@DeleteMapping("/facts/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void forget(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		knowledge.forget(user.id(), id);
	}

	@GetMapping("/stories")
	List<StoryResponse> stories(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return knowledge.stories(user.id()).stream().map(s -> new StoryResponse(s.id(), s.title(), s.updatedAt())).toList();
	}

	@PostMapping(value = "/stories", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	StoryCreatedResponse newStory(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody StoryRequest request) {
		var note = knowledge.newStory(user.id(), request.title());
		return new StoryCreatedResponse(note.id(), note.title(), note.body());
	}

	/** Sets or clears the Story flag on a Note. Clearing it takes the Note off the Stories list. */
	@PutMapping(value = "/notes/{id}/story", consumes = MediaType.APPLICATION_JSON_VALUE)
	void setStory(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@Valid @RequestBody StoryFlagRequest request) {
		knowledge.setStory(user.id(), id, request.story());
	}

	@GetMapping("/preferences")
	PreferencesResponse preferences(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return knowledge.preferences(user.id()).map(p -> new PreferencesResponse(p.targetRoles(), p.places(), p.minBasePay(),
				p.currency(), p.payPeriod(), p.officeDays(), p.noticePeriod()))
				.orElse(new PreferencesResponse("", List.of(), null, null, null, null, ""));
	}

	@PutMapping(value = "/preferences", consumes = MediaType.APPLICATION_JSON_VALUE)
	PreferencesResponse savePreferences(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody PreferencesRequest request) {
		knowledge.savePreferences(user.id(), request.targetRoles(), request.places(), request.minBasePay(), request.currency(),
				request.payPeriod(), request.officeDaysPerWeek(), request.noticePeriod());
		return preferences(user);
	}

}
