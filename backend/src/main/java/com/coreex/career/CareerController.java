package com.coreex.career;

import java.time.Instant;
import java.util.ArrayList;
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
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

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
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "FIT, DRAFT, TIGHTEN, PREP, PRACTICE, DEBRIEF, EMAIL, FOLLOW_UP or THANK_YOU") String kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The posting, Knowledge or documents changed since it was made") boolean outOfDate,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a FIT result") FitResponse fit,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a DRAFT or TIGHTEN result") AnswerResponse answer,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "ACCEPTED or REJECTED; empty while it waits for the User") String resolution,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a PREP result") PrepResponse prep,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a PRACTICE result") PracticeResponse practice,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a DEBRIEF result") SummaryResponse summary,
				@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for an EMAIL, FOLLOW_UP or THANK_YOU result") EmailResponse email,
				@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for a REPLY result") ReplyResponse reply) {
	}

	record PointResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String point,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What shows it; a forgotten or switched-off Fact is left out") List<EvidenceResponse> evidence) {
	}

	record PrepResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The interview's seq in the timeline") int interviewSeq,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> plan,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What the posting says about the company and role") String about,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<PointResponse> stress,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Questions to ask the interviewer") List<String> ask,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Questions to practise") List<String> practice) {
	}

	record QuoteResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Words found in the answer") String quote,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String why) {
	}

	record PracticeResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String question,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String answer,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What works; every quote is from the answer") List<QuoteResponse> works,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String strengthen) {
	}

	record EmailResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String subject,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String body,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "RESUME and/or COVER_LETTER, only those linked on the Application") List<String> attach,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The interview's seq; set for a THANK_YOU") Integer interviewSeq,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What the email relies on; a forgotten or switched-off Fact is left out") List<EvidenceResponse> evidence) {
	}

	record ChangeResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Its place in the reply's changes; apply and undo name it") int index,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) CareerService.Change change,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "PROPOSED, APPLIED or UNDONE") String state,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "True when this applied change can be undone now") boolean canUndo) {
	}

	record ReplyResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The employer's email, with its quoted history removed") String message,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What the email asks") List<String> asks,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What the email leaves unconfirmed") List<String> unconfirmed,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The reply's subject, which the User may edit") String subject,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The reply's body, which the User may edit") String body,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What the reply relies on; a forgotten or switched-off Fact is left out") List<EvidenceResponse> evidence,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The changes the email proposes; each is applied or undone on its own") List<ChangeResponse> changes) {
	}

	record SummaryResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int interviewSeq,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> improve) {
	}

	record PracticeRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotBlank @Size(max = 500) String question,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotBlank @Size(max = 5000) String answer) {
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

	private final ReplyService replies;

	CareerController(CareerService career, ReplyService replies) {
		this.career = career;
		this.replies = replies;
	}

	private ResultResponse respond(Stored stored, Map<UUID, CareerService.Evidence> evidence, Map<Integer, ReplyService.State> states) {
		FitResponse fit = null;
		if (stored.fit() != null) {
			fit = new FitResponse(stored.fit().score(), stored.fit().question(), stored.fit().requirements().stream()
					.map(r -> new RequirementResponse(r.requirement(), r.verdict(), r.note(), evidence(r.evidence(), evidence))).toList());
		}
		var answer = stored.answer() == null ? null
				: new AnswerResponse(stored.answer().questionId(), stored.answer().text(), evidence(stored.answer().evidence(), evidence));
		var prep = stored.prep() == null ? null : new PrepResponse(stored.prep().interviewSeq(), stored.prep().plan(), stored.prep().about(),
				stored.prep().stress().stream().map(p -> new PointResponse(p.point(), evidence(p.evidence(), evidence)))
						.filter(p -> !p.evidence().isEmpty()).toList(),
				stored.prep().ask(), stored.prep().practice());
		var practice = stored.practice() == null ? null : new PracticeResponse(stored.practice().question(), stored.practice().answer(),
				stored.practice().works().stream().map(q -> new QuoteResponse(q.quote(), q.why())).toList(), stored.practice().strengthen());
		var summary = stored.summary() == null ? null : new SummaryResponse(stored.summary().interviewSeq(), stored.summary().improve());
		var email = stored.email() == null ? null : new EmailResponse(stored.email().subject(), stored.email().body(), stored.email().attach(),
				stored.email().interviewSeq(), evidence(stored.email().evidence(), evidence));
		var reply = stored.reply() == null ? null : new ReplyResponse(stored.reply().message(), stored.reply().asks(),
					stored.reply().unconfirmed(), stored.reply().subject(), stored.reply().body(), evidence(stored.reply().evidence(), evidence),
					changes(stored.reply().changes(), states));
			return new ResultResponse(stored.id(), stored.kind(), stored.outOfDate(), stored.createdAt(), fit, answer, stored.resolution(), prep,
				practice, summary, email, reply);
	}

	/** Each change with its state: PROPOSED until it is applied, then APPLIED, and UNDONE once it is undone. */
	private static List<ChangeResponse> changes(List<CareerService.Change> changes, Map<Integer, ReplyService.State> states) {
		var out = new ArrayList<ChangeResponse>();
		for (int i = 0; i < changes.size(); i++) {
			var state = states.get(i);
			out.add(new ChangeResponse(i, changes.get(i), state == null ? "PROPOSED" : state.state(), state != null && state.canUndo()));
		}
		return out;
	}

	private static List<EvidenceResponse> evidence(List<UUID> ids, Map<UUID, CareerService.Evidence> known) {
		return ids.stream().filter(known::containsKey).map(id -> new EvidenceResponse(id, known.get(id).kind(), known.get(id).label())).toList();
	}

	List<ResultResponse> respond(UUID owner, List<Stored> stored) {
		var ids = new LinkedHashSet<UUID>();
		stored.forEach(s -> {
			if (s.fit() != null) s.fit().requirements().forEach(r -> ids.addAll(r.evidence()));
			if (s.answer() != null) ids.addAll(s.answer().evidence());
			if (s.prep() != null) s.prep().stress().forEach(p -> ids.addAll(p.evidence()));
			if (s.email() != null) ids.addAll(s.email().evidence());
			if (s.reply() != null) ids.addAll(s.reply().evidence());
		});
		var evidence = career.evidence(owner, ids);
		var replyIds = stored.stream().filter(s -> s.reply() != null).map(Stored::id).toList();
		var states = replies.states(owner, replyIds);
		return stored.stream().map(s -> respond(s, evidence, states.getOrDefault(s.id(), Map.of()))).toList();
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

	/** Prepares for one upcoming interview of the Application; the result is kept in the Library. */
	@PostMapping("/interviews/{seq}/prep")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse prep(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable int seq) {
		return respond(user.id(), List.of(career.prep(user.id(), id, seq))).get(0);
	}

	/** Feedback on one typed practice answer; every quote in it comes from that answer. */
	@PostMapping("/practice")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse practice(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@Valid @RequestBody PracticeRequest request) {
		return respond(user.id(), List.of(career.practice(user.id(), id, request.question(), request.answer()))).get(0);
	}

	/** An AI summary of what to improve from the interview's Debrief. */
	@PostMapping("/interviews/{seq}/debrief/summary")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse debriefSummary(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable int seq) {
		return respond(user.id(), List.of(career.debriefSummary(user.id(), id, seq))).get(0);
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
