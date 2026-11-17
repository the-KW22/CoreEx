package com.coreex.career;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.applications.Application.Stage;
import com.coreex.applications.ApplicationService;
import com.coreex.career.CareerService.Question;
import com.coreex.common.ApiException;

import tools.jackson.databind.json.JsonMapper;

/**
 * An Application's form questions and answers, the answer library, and Mark as applied (#276-#278). Every query carries
 * the owner id; a question or library answer of another User is a 404.
 */
@Service
class ApplyService {

	/** The most suggestions shown for a question. */
	private static final int MAX_SUGGESTIONS = 3;

	/** shortcut: only the newest this many library answers are matched, upgrade to a database text search when a User keeps more. */
	private static final int MAX_CANDIDATES = 300;

	enum Scope { REUSABLE, EMPLOYER, JOB }

	record Suggestion(UUID id, Scope scope, String question, String answer, double score) {
	}

	record SentAnswer(String question, String answer, String limitUnit, Integer limitValue, int count) {
	}

	record Submission(Instant sentAt, List<SentAnswer> answers) {
	}

	record Apply(List<Question> questions, List<String> blockers, Submission submission) {
	}

	private final JdbcClient jdbc;

	private final CareerService career;

	private final ApplicationService applications;

	private final JsonMapper json = JsonMapper.builder().build();

	ApplyService(JdbcClient jdbc, CareerService career, ApplicationService applications) {
		this.jdbc = jdbc;
		this.career = career;
		this.applications = applications;
	}

	private static ApiException invalid(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
	}

	/** Both parts of a limit or neither, and a positive number. */
	private static AnswerLimits.Unit unit(String limitUnit, Integer limitValue) {
		if ((limitUnit == null) != (limitValue == null)) throw invalid("A limit needs both a unit and a number.");
		if (limitValue != null && (limitValue < 1 || limitValue > 100_000)) throw invalid("A limit is a number from 1 to 100000.");
		return limitUnit == null ? null : AnswerLimits.Unit.valueOf(limitUnit);
	}

	private static String company(String company) {
		return company.strip().toLowerCase(Locale.ROOT);
	}

	List<Question> questions(UUID owner, UUID applicationId) {
		applications.get(owner, applicationId);
		return jdbc.sql("""
				select id, question, limit_unit, limit_value, answer, version from application_questions
				where owner_id = :owner and item_id = :app order by position, id""").param("owner", owner).param("app", applicationId)
				.query((rs, n) -> new Question(rs.getObject("id", UUID.class), rs.getString("question"), rs.getString("limit_unit"),
						rs.getObject("limit_value", Integer.class), rs.getString("answer"), rs.getInt("version")))
				.list();
	}

	Apply apply(UUID owner, UUID applicationId) {
		var questions = questions(owner, applicationId);
		var submission = jdbc.sql("select answers::text as answers, sent_at from application_submissions where item_id = :app and owner_id = :owner")
				.param("app", applicationId).param("owner", owner)
				.query((rs, n) -> new Submission(rs.getObject("sent_at", OffsetDateTime.class).toInstant(),
						List.of(json.readValue(rs.getString("answers"), SentAnswer[].class))))
				.optional().orElse(null);
		return new Apply(questions, submission == null ? blockers(owner, applicationId, questions) : List.of(), submission);
	}

	@Transactional
	Question add(UUID owner, UUID applicationId, String text, String limitUnit, Integer limitValue) {
		applications.get(owner, applicationId);
		unit(limitUnit, limitValue);
		return jdbc.sql("""
				insert into application_questions (owner_id, item_id, position, question, limit_unit, limit_value)
				select :owner, i.id, coalesce((select max(position) + 1 from application_questions where item_id = i.id), 0), :text, :unit, :value
				from items i where i.id = :app and i.owner_id = :owner and i.deleted_at is null
				returning id, question, limit_unit, limit_value, answer, version""")
				.param("owner", owner).param("app", applicationId).param("text", text.strip()).param("unit", limitUnit).param("value", limitValue)
				.query((rs, n) -> new Question(rs.getObject("id", UUID.class), rs.getString("question"), rs.getString("limit_unit"),
						rs.getObject("limit_value", Integer.class), rs.getString("answer"), rs.getInt("version")))
				.single();
	}

	/** Saves the question, its limit and the answer typed so far; 409 if it was saved elsewhere since {@code seenVersion}. */
	@Transactional
	Question save(UUID owner, UUID applicationId, UUID id, String text, String limitUnit, Integer limitValue, String answer, int seenVersion) {
		career.question(owner, applicationId, id);
		unit(limitUnit, limitValue);
		var saved = jdbc.sql("""
				update application_questions set question = :text, limit_unit = :unit, limit_value = :value, answer = :answer, version = version + 1
				where id = :id and owner_id = :owner and item_id = :app and version = :seen""")
				.param("text", text.strip()).param("unit", limitUnit).param("value", limitValue).param("answer", answer.strip())
				.param("id", id).param("owner", owner).param("app", applicationId).param("seen", seenVersion).update();
		if (saved == 0) throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "This answer was saved somewhere else. Reload and try again.");
		return career.question(owner, applicationId, id);
	}

	void delete(UUID owner, UUID applicationId, UUID id) {
		career.question(owner, applicationId, id);
		jdbc.sql("delete from application_questions where id = :id and owner_id = :owner").param("id", id).param("owner", owner).update();
	}

	/** Keeps the question and its current answer in the library, as reusable, for this employer only, or for this job only. */
	@Transactional
	UUID saveToLibrary(UUID owner, UUID applicationId, UUID questionId, Scope scope) {
		var question = career.question(owner, applicationId, questionId);
		if (question.answer().isBlank()) throw invalid("Write an answer before keeping it.");
		var application = applications.get(owner, applicationId);
		var company = scope == Scope.EMPLOYER ? company(application.company()) : null;
		var job = scope == Scope.JOB ? applicationId : null;
		var existing = jdbc.sql("""
				select id from answer_library where owner_id = :owner and scope = :scope and company is not distinct from :company
				and item_id is not distinct from :job and question = :question and answer = :answer""")
				.param("owner", owner).param("scope", scope.name()).param("company", company).param("job", job)
				.param("question", question.text()).param("answer", question.answer()).query(UUID.class).optional();
		if (existing.isPresent()) return existing.get();
		return jdbc.sql("""
				insert into answer_library (owner_id, scope, company, item_id, question, answer) values (:owner, :scope, :company, :job, :question, :answer)
				returning id""").param("owner", owner).param("scope", scope.name()).param("company", company).param("job", job)
				.param("question", question.text()).param("answer", question.answer()).query(UUID.class).single();
	}

	private record Row(UUID id, Scope scope, String question, String answer) {
	}

	/** Library answers that fit this question, best first: matched by words alone, never by AI (C14). */
	List<Suggestion> suggestions(UUID owner, UUID applicationId, UUID questionId) {
		var question = career.question(owner, applicationId, questionId);
		var company = company(applications.get(owner, applicationId).company());
		var rows = jdbc.sql("""
				select id, scope, question, answer from answer_library
				where owner_id = :owner and (scope = 'REUSABLE' or (scope = 'EMPLOYER' and company = :company) or (scope = 'JOB' and item_id = :app))
				order by created_at desc, id limit :max""").param("owner", owner).param("company", company).param("app", applicationId)
				.param("max", MAX_CANDIDATES)
				.query((rs, n) -> new Row(rs.getObject("id", UUID.class), Scope.valueOf(rs.getString("scope")), rs.getString("question"),
						rs.getString("answer")))
				.list();
		return rows.stream().map(r -> new Suggestion(r.id(), r.scope(), r.question(), r.answer(), AnswerMatch.score(question.text(), r.question())))
				.filter(s -> s.score() >= AnswerMatch.THRESHOLD).sorted(Comparator.comparingDouble(Suggestion::score).reversed())
				.limit(MAX_SUGGESTIONS).toList();
	}

	/** Copies a library answer into the question. It stays a copy: later edits never reach the library. */
	@Transactional
	Question reuse(UUID owner, UUID applicationId, UUID questionId, UUID libraryId, int seenVersion) {
		var suggestion = suggestions(owner, applicationId, questionId).stream().filter(s -> s.id().equals(libraryId)).findFirst()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "That answer is not available for this question."));
		var question = career.question(owner, applicationId, questionId);
		return save(owner, applicationId, questionId, question.text(), question.limitUnit(), question.limitValue(), suggestion.answer(), seenVersion);
	}

	void deleteFromLibrary(UUID owner, UUID applicationId, UUID libraryId) {
		applications.get(owner, applicationId);
		var removed = jdbc.sql("delete from answer_library where id = :id and owner_id = :owner").param("id", libraryId).param("owner", owner).update();
		if (removed == 0) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Library answer not found.");
	}

	private static String shorten(String text) {
		return text.length() > 60 ? text.substring(0, 60) + "..." : text;
	}

	/** What still stops Mark as applied: answers over their limit, no Resume, or a linked Cover Letter that is gone. */
	private List<String> blockers(UUID owner, UUID applicationId, List<Question> questions) {
		var blockers = new ArrayList<String>();
		for (var q : questions) {
			var unit = q.limitUnit() == null ? null : AnswerLimits.Unit.valueOf(q.limitUnit());
			if (!AnswerLimits.within(unit, q.limitValue(), q.answer())) {
				blockers.add("The answer to \"" + shorten(q.text()) + "\" is over its limit: " + AnswerLimits.count(unit, q.answer()) + " of "
						+ q.limitValue() + " " + q.limitUnit().toLowerCase(Locale.ROOT) + ".");
			}
		}
		var live = jdbc.sql("""
				select d.kind from application_linked_documents d join items i on i.id = d.item_id
				where d.owner_id = :owner and d.application_id = :app and i.deleted_at is null""").param("owner", owner).param("app", applicationId)
				.query(String.class).list();
		var linked = jdbc.sql("select kind from application_linked_documents where owner_id = :owner and application_id = :app")
				.param("owner", owner).param("app", applicationId).query(String.class).list();
		if (!live.contains("RESUME")) blockers.add("Attach a Resume.");
		if (linked.contains("COVER_LETTER") && !live.contains("COVER_LETTER")) {
			blockers.add("The linked Cover Letter is missing. Link another one or remove the link.");
		}
		return blockers;
	}

	/**
	 * Moves a Saved Application to Applied through the same Stage rule as the stepper (which keeps the sent Resume and Cover
	 * Letter) and records the answers that were sent. The Application row is locked first so a document cannot be unlinked
	 * between the check and the move.
	 */
	@Transactional
	Submission markApplied(UUID owner, UUID applicationId) {
		jdbc.sql("""
				select c.item_id from application_contents c join items i on i.id = c.item_id
				where i.id = :app and i.owner_id = :owner and i.type = 'APPLICATION' and i.deleted_at is null for update of c""")
				.param("app", applicationId).param("owner", owner).query(UUID.class).optional()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Application not found."));
		var application = applications.get(owner, applicationId);
		if (application.stage() != Stage.SAVED) {
			throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Only a Saved Application can be marked as applied.");
		}
		var questions = questions(owner, applicationId);
		var blockers = blockers(owner, applicationId, questions);
		if (!blockers.isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "NOT_READY", "Fix these first: " + String.join(" ", blockers));
		}
		applications.moveStage(owner, applicationId, Stage.APPLIED, null, null, Stage.SAVED, null);
		var sent = questions.stream().map(q -> new SentAnswer(q.text(), q.answer(), q.limitUnit(), q.limitValue(),
				AnswerLimits.count(q.limitUnit() == null ? AnswerLimits.Unit.WORDS : AnswerLimits.Unit.valueOf(q.limitUnit()), q.answer()))).toList();
		jdbc.sql("insert into application_submissions (item_id, owner_id, answers) values (:app, :owner, :answers::jsonb)")
				.param("app", applicationId).param("owner", owner).param("answers", json.writeValueAsString(sent)).update();
		return apply(owner, applicationId).submission();
	}

}
