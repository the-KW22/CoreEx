package com.coreex.career;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.coreex.ai.AiService;
import com.coreex.applications.Application;
import com.coreex.applications.Application.TimelineEntry;
import com.coreex.applications.ApplicationService;
import com.coreex.common.ApiException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Runs Career AI tasks for an Application (ADR 0013) and keeps their results. Every query carries the owner id. The
 * posting and every document go to the model as tagged data; a result cites only ids that were in the prompt; and a
 * result is stored only if its inputs are unchanged since the call began. "Out of date" is a fingerprint compare.
 */
@Service
public class CareerService {

	// shortcut: at most this many Facts and Stories go into a prompt, upgrade to choosing the relevant ones when a User holds more.
	private static final int MAX_FACTS = 300;

	private static final int MAX_STORIES = 20;

	private static final int STORY_MAX = 4_000;

	private static final int RESUME_MAX = 30_000;

	public enum Verdict { SUPPORTED, PARTLY, MISSING }

	/** What a prompt was built from: its text, the ids it may cite and the hash of the text. */
	record Gathered(String data, Set<UUID> ids, String fingerprint) {
	}

	public record Requirement(String requirement, Verdict verdict, List<UUID> evidence, String note) {
	}

	/** What is stored for a Fit result; the evidence is ids only, so a forgotten Fact leaves no words behind. */
	public record Fit(int score, String question, List<Requirement> requirements) {
	}

	/** What is stored for a Draft or Tighten result: the proposed text, and for a Draft the evidence it cited (ids only). */
	public record Answer(UUID questionId, String text, List<UUID> evidence) {
	}

	/** One thing to stress in an interview, with the evidence ids that show it. */
	public record Point(String point, List<UUID> evidence) {
	}

	/** What is stored for Interview prep: for one interview of the Application, ids only for evidence. */
	public record Prep(int interviewSeq, List<String> plan, String about, List<Point> stress, List<String> ask, List<String> practice) {
	}

	public record Quote(String quote, String why) {
	}

	/** One practice attempt: the question, the typed answer, and feedback whose quotes were all found in that answer. */
	public record Practice(String question, String answer, List<Quote> works, String strengthen) {
	}

	/** The AI summary of a Debrief. */
	public record Summary(int interviewSeq, List<String> improve) {
	}

	/**
	 * An Application email: the text the User copies or opens in their own mail app, the documents it names to attach, and
	 * the evidence it relied on. {@code interviewSeq} is set for a thank-you. The text is editable; the inputs are not.
	 */
	public record Email(String subject, String body, List<String> attach, List<UUID> evidence, Integer interviewSeq) {
	}

	/** A document linked to the Application, as the prompt names it: its kind and the title it was sent under (or its live title). */
	record Attachment(String kind, String title) {
	}

	/**
	 * What a task made: a {@link Fit}, {@link Answer}, {@link Prep}, {@link Practice}, {@link Summary} or {@link Email}.
	 * {@code resolution} is null while an answer is waiting for Accept or Reject.
	 */
	public record Stored(UUID id, String kind, Object result, String resolution, boolean outOfDate, Instant createdAt) {

		public Fit fit() {
			return result instanceof Fit f ? f : null;
		}

		public Email email() {
			return result instanceof Email e ? e : null;
		}

		public Answer answer() {
			return result instanceof Answer a ? a : null;
		}

		public Prep prep() {
			return result instanceof Prep p ? p : null;
		}

		public Practice practice() {
			return result instanceof Practice p ? p : null;
		}

		public Summary summary() {
			return result instanceof Summary s ? s : null;
		}

	}

	/** What a task is about besides the Application: a form question, an interview, or a practice question and answer. */
	record Subject(UUID questionId, Integer interviewSeq, String practiceQuestion, String practiceAnswer) {

		static final Subject NONE = new Subject(null, null, null, null);

		static Subject question(UUID id) {
			return new Subject(id, null, null, null);
		}

		static Subject interview(int seq) {
			return new Subject(null, seq, null, null);
		}

	}

	/** One form question of an Application, with the answer so far. */
	record Question(UUID id, String text, String limitUnit, Integer limitValue, String answer, int version) {
	}

	public record Evidence(UUID id, String kind, String label) {
	}

	private final JdbcClient jdbc;

	private final AiService ai;

	private final ApplicationService applications;

	private final TransactionTemplate tx;

	private final JsonMapper json = JsonMapper.builder().build();

	CareerService(JdbcClient jdbc, AiService ai, ApplicationService applications, TransactionTemplate tx) {
		this.jdbc = jdbc;
		this.ai = ai;
		this.applications = applications;
		this.tx = tx;
	}

	private static String esc(String text) {
		return text == null ? "" : text.replace("&", "&amp;").replace("<", "&lt;").replace("\"", "&quot;");
	}

	private static String cut(String text, int max) {
		return text.length() > max ? text.substring(0, max) : text;
	}

	/** Reads the task's inputs for the User's Application; 404 when it is not theirs or is in the Trash. */
	Gathered gather(UUID owner, UUID applicationId, CareerTask task) {
		return gather(owner, applicationId, task, Subject.NONE);
	}

	/** The same for a task about one form question, interview or practice answer; 404 when it is not on this User's Application. */
	Gathered gather(UUID owner, UUID applicationId, CareerTask task, Subject subject) {
		var application = applications.get(owner, applicationId);
		var questionId = subject.questionId();
		var data = new StringBuilder();
		var ids = new LinkedHashSet<UUID>();
		for (var input : task.inputs()) {
			switch (input) {
				case POSTING -> data.append("<posting>\n").append(esc(application.postingText())).append("\n</posting>\n");
				case RESUME -> jdbc.sql("""
						select i.id, c.plain_text, c.version from application_linked_documents d
						join items i on i.id = d.item_id join resume_contents c on c.item_id = i.id
						where d.owner_id = :owner and d.application_id = :app and d.kind = 'RESUME' and i.deleted_at is null""")
						.param("owner", owner).param("app", applicationId).query((rs, n) -> {
							var id = rs.getObject("id", UUID.class);
							ids.add(id);
							data.append("<resume id=\"").append(id).append("\" version=\"").append(rs.getInt("version")).append("\">\n")
									.append(esc(cut(rs.getString("plain_text"), RESUME_MAX))).append("\n</resume>\n");
							return id;
						}).list();
				// Only ACTIVE Facts: a switched-off Fact is never sent, and a forgotten one no longer exists.
				case KNOWLEDGE -> jdbc.sql("""
						select id, category, text from facts where owner_id = :owner and status = 'ACTIVE' order by id limit :max""")
						.param("owner", owner).param("max", MAX_FACTS).query((rs, n) -> {
							var id = rs.getObject("id", UUID.class);
							ids.add(id);
							data.append("<fact id=\"").append(id).append("\" category=\"").append(rs.getString("category")).append("\">")
									.append(esc(rs.getString("text"))).append("</fact>\n");
							return id;
						}).list();
				case STORIES -> jdbc.sql("""
						select i.id, i.title, c.body, c.version from items i join note_contents c on c.item_id = i.id
						where i.owner_id = :owner and i.type = 'NOTE' and i.deleted_at is null and c.story
						order by i.id limit :max""").param("owner", owner).param("max", MAX_STORIES).query((rs, n) -> {
							var id = rs.getObject("id", UUID.class);
							ids.add(id);
							data.append("<story id=\"").append(id).append("\" version=\"").append(rs.getInt("version")).append("\" title=\"")
									.append(esc(rs.getString("title"))).append("\">\n").append(esc(cut(rs.getString("body"), STORY_MAX)))
									.append("\n</story>\n");
							return id;
						}).list();
				case APPLICATION -> {
					data.append("<application company=\"").append(esc(application.company())).append("\" role=\"").append(esc(application.role()))
							.append("\" stage=\"").append(application.stage()).append("\" appliedOn=\"")
							.append(application.appliedOn() == null ? "" : application.appliedOn().toString()).append("\">\n");
					for (var e : application.timeline()) {
						data.append("<entry type=\"").append(e.type()).append("\" at=\"").append(e.at()).append("\">").append(esc(e.text()))
								.append("</entry>\n");
					}
					data.append("</application>\n");
				}
				case ATTACHMENTS -> {
					data.append("<attachments>");
					for (var d : attachments(owner, applicationId)) {
						data.append("<file kind=\"").append(d.kind()).append("\">").append(esc(d.title())).append("</file>");
					}
					data.append("</attachments>\n");
				}
				case QUESTION -> {
					var q = question(owner, applicationId, questionId);
					data.append("<question limit=\"").append(q.limitValue() == null ? "none" : q.limitValue() + " " + q.limitUnit().toLowerCase())
							.append("\">").append(esc(q.text())).append("</question>\n");
				}
				case ANSWER -> data.append("<answer>").append(esc(question(owner, applicationId, questionId).answer())).append("</answer>\n");
				case INTERVIEW -> {
					var entry = interview(application, subject.interviewSeq());
					data.append("<interview kind=\"").append(esc(entry.kind())).append("\" at=\"").append(entry.at()).append("\">")
							.append(esc(entry.text())).append("</interview>\n");
				}
				case PRACTICE -> data.append("<practice question=\"").append(esc(subject.practiceQuestion())).append("\">")
						.append(esc(subject.practiceAnswer())).append("</practice>\n");
				case DEBRIEF -> {
					interview(application, subject.interviewSeq());
					var found = jdbc.sql("""
							select notes, questions::text as questions from interview_debriefs
							where owner_id = :owner and item_id = :app and interview_seq = :seq""")
							.param("owner", owner).param("app", applicationId).param("seq", subject.interviewSeq())
							.query((rs, n) -> new String[] { rs.getString("notes"), rs.getString("questions") }).optional()
							.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Write the Debrief first."));
					data.append("<debrief>\n").append(esc(found[0])).append('\n');
					for (JsonNode asked : json.readTree(found[1])) {
						data.append("<asked landed=\"").append(esc(asked.path("landed").asString(""))).append("\">")
								.append(esc(asked.path("question").asString(""))).append(" | ").append(esc(asked.path("note").asString("")))
								.append("</asked>\n");
					}
					data.append("</debrief>\n");
				}
				case PREFERENCES -> jdbc.sql("""
						select target_roles, places, min_base_pay, currency, pay_period, office_days, notice_period
						from career_preferences where owner_id = :owner""").param("owner", owner).query((rs, n) -> {
							data.append("<preferences>target roles: ").append(esc(rs.getString("target_roles"))).append("; places: ")
									.append(esc(String.join(", ", (String[]) rs.getArray("places").getArray()))).append("; minimum base pay: ")
									.append(rs.getBigDecimal("min_base_pay")).append(' ').append(rs.getString("currency")).append(" per ")
									.append(rs.getString("pay_period")).append("; office days: ").append(rs.getObject("office_days"))
									.append("; notice: ").append(esc(rs.getString("notice_period"))).append("</preferences>\n");
							return 0;
						}).list();
			}
		}
		var text = data.toString();
		return new Gathered(text, ids, fingerprint(text));
	}

	/** The documents linked to the Application: a sent one under the title it was sent with, otherwise its live title; trashed ones are left out. */
	List<Attachment> attachments(UUID owner, UUID applicationId) {
		return jdbc.sql("""
				select d.kind, case when d.sent_at is not null then d.sent_title else i.title end as title
				from application_linked_documents d left join items i on i.id = d.item_id
				where d.owner_id = :owner and d.application_id = :app and (d.sent_at is not null or i.deleted_at is null)
				order by d.kind""")
				.param("owner", owner).param("app", applicationId)
				.query((rs, n) -> new Attachment(rs.getString("kind"), rs.getString("title"))).list();
	}

	/** The INTERVIEW entry of the timeline with this seq; 404 when there is none. */
	static TimelineEntry interview(Application application, Integer seq) {
		return application.timeline().stream().filter(e -> e.type().equals("INTERVIEW") && seq != null && e.seq() == seq).findFirst()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Interview not found."));
	}

	Question question(UUID owner, UUID applicationId, UUID id) {
		if (id == null) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Question not found.");
		return jdbc.sql("""
				select q.id, q.question, q.limit_unit, q.limit_value, q.answer, q.version from application_questions q
				join items i on i.id = q.item_id and i.owner_id = q.owner_id
				where q.id = :id and q.owner_id = :owner and q.item_id = :app and i.deleted_at is null""")
				.param("id", id).param("owner", owner).param("app", applicationId)
				.query((rs, n) -> new Question(rs.getObject("id", UUID.class), rs.getString("question"), rs.getString("limit_unit"),
						rs.getObject("limit_value", Integer.class), rs.getString("answer"), rs.getInt("version")))
				.optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Question not found."));
	}

	private static String fingerprint(String text) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
		}
		catch (java.security.NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/** The "Sends: ..." line of every task, by kind. */
	public Map<String, String> sends() {
		return Map.of(CareerTask.FIT.kind(), CareerTask.FIT.sends(), CareerTask.DRAFT.kind(), CareerTask.DRAFT.sends(),
				CareerTask.TIGHTEN.kind(), CareerTask.TIGHTEN.sends(), CareerTask.PREP.kind(), CareerTask.PREP.sends(),
				CareerTask.PRACTICE.kind(), CareerTask.PRACTICE.sends(), CareerTask.DEBRIEF.kind(), CareerTask.DEBRIEF.sends(),
				CareerTask.EMAIL.kind(), CareerTask.EMAIL.sends(), CareerTask.FOLLOW_UP.kind(), CareerTask.FOLLOW_UP.sends(),
				CareerTask.THANK_YOU.kind(), CareerTask.THANK_YOU.sends());
	}

	/** Runs the Fit check and stores its result. */
	public Stored fit(UUID owner, UUID applicationId) {
		return run(owner, applicationId, CareerTask.FIT, Subject.NONE, CareerService::parseFit,
				"Your posting or Knowledge changed while the AI was working. Run the check again.");
	}

	/** Drafts an answer to a form question from the posting and the User's evidence; kept as a result until accepted or rejected. */
	public Stored draft(UUID owner, UUID applicationId, UUID questionId) {
		question(owner, applicationId, questionId);
		return run(owner, applicationId, CareerTask.DRAFT, Subject.question(questionId), (answer, given) -> parseDraft(questionId, answer, given),
				"Your posting, Knowledge or question changed while the AI was working. Draft again.");
	}

	/** Shortens the current answer without going over the limit; a result that is not shorter or not within the limit is refused. */
	public Stored tighten(UUID owner, UUID applicationId, UUID questionId) {
		var question = question(owner, applicationId, questionId);
		if (question.answer().isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Write an answer first, then tighten it.");
		}
		return run(owner, applicationId, CareerTask.TIGHTEN, Subject.question(questionId), (answer, given) -> parseTighten(question, answer),
				"Your answer changed while the AI was working. Tighten again.");
	}

	private Stored run(UUID owner, UUID applicationId, CareerTask task, Subject subject,
			java.util.function.BiFunction<String, Set<UUID>, Object> parse, String changed) {
		if (task.inputs().contains(CareerTask.Input.POSTING)) {
			var posting = applications.get(owner, applicationId).postingText();
			if (posting == null || posting.isBlank()) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Add the posting text to this Application first.");
			}
		}
		var before = gather(owner, applicationId, task, subject);
		var reply = ai.askWithUse(owner, task.system(), before.data(), task.schema());
		var result = parse.apply(reply.text(), before.ids());
		Set<UUID> evidence = switch (result) {
			case Fit fit -> fit.requirements().stream().flatMap(r -> r.evidence().stream()).collect(Collectors.toCollection(LinkedHashSet::new));
			case Answer answer -> new LinkedHashSet<>(answer.evidence());
			case Email email -> new LinkedHashSet<>(email.evidence());
			case Prep prep -> prep.stress().stream().flatMap(p -> p.evidence().stream()).collect(Collectors.toCollection(LinkedHashSet::new));
			default -> Set.of();
		};
		return tx.execute(status -> {
			// The inputs and the Application are read again here: a result for inputs that changed during the call is refused.
			var now = gather(owner, applicationId, task, subject);
			if (!now.fingerprint().equals(before.fingerprint())) {
				throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", changed);
			}
			return jdbc.sql("""
					insert into career_results (owner_id, item_id, kind, data, evidence_ids, input_fingerprint, input_tokens, output_tokens)
					select :owner, i.id, :kind, :data::jsonb, :evidence, :fingerprint, :in, :out from items i
					where i.id = :app and i.owner_id = :owner and i.deleted_at is null returning id, created_at""")
					.param("owner", owner).param("app", applicationId).param("kind", task.kind())
					.param("data", json.writeValueAsString(result)).param("evidence", evidence.toArray(UUID[]::new))
					.param("fingerprint", now.fingerprint()).param("in", reply.inputTokens()).param("out", reply.outputTokens())
					.query((rs, n) -> new Stored(rs.getObject("id", UUID.class), task.kind(), result, null, false,
							rs.getObject("created_at", OffsetDateTime.class).toInstant()))
					.optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Application not found."));
		});
	}

	/** Interview prep for one interview that has not started yet. */
	public Stored prep(UUID owner, UUID applicationId, int interviewSeq) {
		var interview = interview(applications.get(owner, applicationId), interviewSeq);
		if (!interview.at().isAfter(Instant.now())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "That interview has already started. Prepare for an upcoming one.");
		}
		return run(owner, applicationId, CareerTask.PREP, Subject.interview(interviewSeq), (answer, given) -> parsePrep(interviewSeq, answer, given),
				"Your posting, Knowledge or interview changed while the AI was working. Prepare again.");
	}

	/** Feedback on one typed practice answer; the attempt is kept as a result and is never out of date. */
	public Stored practice(UUID owner, UUID applicationId, String question, String answer) {
		var q = question == null ? "" : question.strip();
		var a = answer == null ? "" : answer.strip();
		if (q.isEmpty() || q.length() > 500 || a.isEmpty() || a.length() > 5_000) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Give a question up to 500 characters and an answer up to 5,000.");
		}
		return run(owner, applicationId, CareerTask.PRACTICE, new Subject(null, null, q, a), (reply, given) -> parsePractice(q, a, reply),
				"Your Application changed while the AI was working. Try again.");
	}

	/** The AI summary of what to improve from one Debrief. */
	public Stored debriefSummary(UUID owner, UUID applicationId, int interviewSeq) {
		return run(owner, applicationId, CareerTask.DEBRIEF, Subject.interview(interviewSeq), (answer, given) -> parseSummary(interviewSeq, answer),
				"Your Debrief changed while the AI was working. Summarise again.");
	}

	/** Drafts the email that sends the Resume and Cover Letter; kept as an editable result. */
	public Stored applicationEmail(UUID owner, UUID applicationId) {
		return run(owner, applicationId, CareerTask.EMAIL, Subject.NONE,
				(answer, given) -> parseEmail(answer, given, linkedKinds(owner, applicationId), null),
				"Your posting, Knowledge, Stories or documents changed while the AI was working. Draft the email again.");
	}

	/** Drafts a follow-up to an employer that has not replied; refused until the Application is marked applied. */
	public Stored followUp(UUID owner, UUID applicationId) {
		if (applications.get(owner, applicationId).appliedOn() == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Mark this Application as applied first.");
		}
		return run(owner, applicationId, CareerTask.FOLLOW_UP, Subject.NONE, (answer, given) -> parseEmail(answer, given, Set.of(), null),
				"Your posting or Application changed while the AI was working. Draft the follow-up again.");
	}

	/** Drafts a thank-you after one interview, from its Debrief; 404 without a Debrief. */
	public Stored thankYou(UUID owner, UUID applicationId, int interviewSeq) {
		return run(owner, applicationId, CareerTask.THANK_YOU, Subject.interview(interviewSeq),
				(answer, given) -> parseEmail(answer, given, Set.of(), interviewSeq),
				"Your Debrief, Knowledge or Stories changed while the AI was working. Draft the thank-you again.");
	}

	/** The kinds of document linked to the Application, as the prompt lists them: an attachment is limited to these. */
	private Set<String> linkedKinds(UUID owner, UUID applicationId) {
		return attachments(owner, applicationId).stream().map(Attachment::kind).collect(Collectors.toSet());
	}

	/**
	 * Saves the User's edit of an email result: the subject and body only. The inputs it was made from stay the same, so
	 * its out-of-date mark does not change.
	 */
	public Stored editEmail(UUID owner, UUID applicationId, UUID resultId, String subject, String body) {
		var text = subject.strip();
		if (text.isEmpty() || text.contains("\n") || text.contains("\r")) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "The subject must be one line.");
		}
		applications.get(owner, applicationId);
		tx.executeWithoutResult(status -> {
			var row = jdbc.sql("""
					select data::text as data from career_results
					where id = :id and owner_id = :owner and item_id = :app and kind in ('EMAIL', 'FOLLOW_UP', 'THANK_YOU') for update""")
					.param("id", resultId).param("owner", owner).param("app", applicationId)
					.query((rs, n) -> rs.getString("data")).optional()
					.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Result not found."));
			var email = json.readValue(row, Email.class);
			var edited = new Email(text, body.strip(), email.attach(), email.evidence(), email.interviewSeq());
			jdbc.sql("update career_results set data = :data::jsonb where id = :id and owner_id = :owner")
					.param("data", json.writeValueAsString(edited)).param("id", resultId).param("owner", owner).update();
		});
		// shortcut: reads every result to return this one, upgrade to a single-row read when the Library grows long.
		return results(owner, applicationId).stream().filter(s -> s.id().equals(resultId)).findFirst().orElseThrow();
	}

	/**
	 * Accepts or rejects a waiting Draft or Tighten result. Accepting writes its text as the question's answer, but only
	 * if the answer is still the version the User saw.
	 */
	public void resolve(UUID owner, UUID applicationId, UUID resultId, boolean accept, int seenVersion) {
		applications.get(owner, applicationId);
		tx.executeWithoutResult(status -> {
			var row = jdbc.sql("""
					select data::text as data, resolution from career_results
					where id = :id and owner_id = :owner and item_id = :app and kind in ('DRAFT', 'TIGHTEN') for update""")
					.param("id", resultId).param("owner", owner).param("app", applicationId)
					.query((rs, n) -> new String[] { rs.getString("data"), rs.getString("resolution") }).optional()
					.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Result not found."));
			if (row[1] != null) throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "That result was already accepted or rejected.");
			if (accept) {
				var answer = json.readValue(row[0], Answer.class);
				var saved = jdbc.sql("""
						update application_questions set answer = :text, version = version + 1
						where id = :q and owner_id = :owner and item_id = :app and version = :seen""")
						.param("text", answer.text()).param("q", answer.questionId()).param("owner", owner).param("app", applicationId)
						.param("seen", seenVersion).update();
				if (saved == 0) {
					throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "The answer changed since you saw it. Reload and try again.");
				}
			}
			jdbc.sql("update career_results set resolution = :r where id = :id and owner_id = :owner")
					.param("r", accept ? "ACCEPTED" : "REJECTED").param("id", resultId).param("owner", owner).update();
		});
	}

	/** A Draft: some text, with only the evidence ids that were given. */
	static Answer parseDraft(UUID questionId, String answer, Set<UUID> given) {
		try {
			var root = JsonMapper.builder().build().readTree(answer);
			var text = root.path("draft").asString("").trim();
			if (text.isEmpty() || !root.path("draft").isString()) throw new IllegalArgumentException();
			var cited = new LinkedHashSet<UUID>();
			for (JsonNode e : root.path("evidence")) {
				try {
					var id = UUID.fromString(e.asString(""));
					if (given.contains(id)) cited.add(id);
				}
				catch (IllegalArgumentException ignored) {
					// Not an id at all: dropped like one that was not given.
				}
			}
			return new Answer(questionId, cut(text, 20_000), List.copyOf(cited));
		}
		catch (RuntimeException e) {
			throw badAnswer();
		}
	}

	/** A Tighten: shorter than the answer it came from and within the limit, or it is refused and nothing is saved. */
	static Answer parseTighten(Question question, String answer) {
		String text;
		try {
			text = JsonMapper.builder().build().readTree(answer).path("tightened").asString("").trim();
		}
		catch (RuntimeException e) {
			throw badAnswer();
		}
		var unit = question.limitUnit() == null ? null : AnswerLimits.Unit.valueOf(question.limitUnit());
		var current = question.answer().strip();
		if (text.isEmpty() || text.codePointCount(0, text.length()) >= current.codePointCount(0, current.length())
				|| !AnswerLimits.within(unit, question.limitValue(), text)) {
			throw badAnswer();
		}
		return new Answer(question.id(), text, List.of());
	}

	/**
	 * An email: a one-line subject and a body within the limits, or the answer is refused. The documents it attaches are
	 * limited to the kinds linked on the Application, and evidence to the ids that were given; anything else is dropped.
	 */
	static Email parseEmail(String answer, Set<UUID> given, Set<String> linked, Integer interviewSeq) {
		try {
			var root = JsonMapper.builder().build().readTree(answer);
			var subject = root.path("subject");
			var body = root.path("body");
			if (!subject.isString() || !body.isString() || !root.path("attach").isArray() || !root.path("evidence").isArray()) {
				throw new IllegalArgumentException();
			}
			var text = subject.asString().strip();
			var bodyText = body.asString().strip();
			if (text.isEmpty() || text.length() > 200 || text.contains("\n") || text.contains("\r")) throw new IllegalArgumentException();
			if (bodyText.isEmpty() || bodyText.length() > 5_000) throw new IllegalArgumentException();
			var attach = new LinkedHashSet<String>();
			for (JsonNode a : root.path("attach")) {
				var kind = a.asString("");
				if (!kind.equals("RESUME") && !kind.equals("COVER_LETTER")) throw new IllegalArgumentException();
				if (linked.contains(kind)) attach.add(kind);
			}
			var cited = new LinkedHashSet<UUID>();
			for (JsonNode e : root.path("evidence")) {
				try {
					var id = UUID.fromString(e.asString(""));
					if (given.contains(id)) cited.add(id);
				}
				catch (IllegalArgumentException ignored) {
					// Not an id at all: dropped like one that was not given.
				}
			}
			return new Email(text, bodyText, List.copyOf(attach), List.copyOf(cited), interviewSeq);
		}
		catch (RuntimeException e) {
			throw badAnswer();
		}
	}

	private static ApiException badAnswer() {
		return new ApiException(HttpStatus.BAD_GATEWAY, "AI_BAD_ANSWER",
				"The AI answered in a form CoreEx could not use, so nothing was saved. Try again.");
	}

	private static List<String> strings(JsonNode array, int max, int length) {
		if (!array.isArray()) throw new IllegalArgumentException();
		var out = new ArrayList<String>();
		for (JsonNode e : array) {
			if (!e.isString()) throw new IllegalArgumentException();
			var text = e.asString().trim();
			if (!text.isEmpty() && out.size() < max) out.add(cut(text, length));
		}
		if (out.isEmpty()) throw new IllegalArgumentException();
		return out;
	}

	/** Interview prep: a point to stress with no evidence the prompt contained is dropped, never shown as supported. */
	static Prep parsePrep(int seq, String answer, Set<UUID> given) {
		try {
			var root = JsonMapper.builder().build().readTree(answer);
			var stress = new ArrayList<Point>();
			if (!root.path("stress").isArray()) throw new IllegalArgumentException();
			for (JsonNode s : root.path("stress")) {
				var point = s.path("point").asString("").trim();
				var cited = new LinkedHashSet<UUID>();
				for (JsonNode e : s.path("evidence")) {
					try {
						var id = UUID.fromString(e.asString(""));
						if (given.contains(id)) cited.add(id);
					}
					catch (IllegalArgumentException ignored) {
						// Not an id at all: dropped like one that was not given.
					}
				}
				if (!point.isEmpty() && !cited.isEmpty() && stress.size() < 6) stress.add(new Point(cut(point, 500), List.copyOf(cited)));
			}
			return new Prep(seq, strings(root.path("plan"), 8, 300), cut(root.path("about").asString("").trim(), 1_500), stress,
					strings(root.path("ask"), 8, 300), strings(root.path("practice"), 10, 300));
		}
		catch (RuntimeException e) {
			throw badAnswer();
		}
	}

	private static String squash(String text) {
		return text.replaceAll("\\s+", " ").trim();
	}

	/** Practice feedback: a quote is kept only if those exact words (spaces aside) are in the answer that was typed. */
	static Practice parsePractice(String question, String typed, String answer) {
		try {
			var root = JsonMapper.builder().build().readTree(answer);
			var strengthen = root.path("strengthen").asString("").trim();
			if (!root.path("works").isArray() || strengthen.isEmpty()) throw new IllegalArgumentException();
			var haystack = squash(typed);
			var works = new ArrayList<Quote>();
			for (JsonNode w : root.path("works")) {
				var quote = squash(w.path("quote").asString(""));
				if (!quote.isEmpty() && haystack.contains(quote) && works.size() < 3) {
					works.add(new Quote(cut(quote, 500), cut(w.path("why").asString("").trim(), 300)));
				}
			}
			return new Practice(question, typed, works, cut(strengthen, 800));
		}
		catch (RuntimeException e) {
			throw badAnswer();
		}
	}

	static Summary parseSummary(int seq, String answer) {
		try {
			return new Summary(seq, strings(JsonMapper.builder().build().readTree(answer).path("improve"), 5, 300));
		}
		catch (RuntimeException e) {
			throw badAnswer();
		}
	}

	/** The answer, checked: a score outside 0-100 or a broken shape is refused; a cited id that was not given is dropped. */
	static Fit parseFit(String answer, Set<UUID> given) {
		try {
			var root = JsonMapper.builder().build().readTree(answer);
			var score = root.path("score");
			if (!score.isIntegralNumber() || score.asInt() < 0 || score.asInt() > 100 || !root.path("requirements").isArray()
					|| root.path("requirements").size() > 15) {
				throw new IllegalArgumentException();
			}
			var requirements = new ArrayList<Requirement>();
			for (JsonNode r : root.path("requirements")) {
				var text = r.path("requirement").asString("").trim();
				if (text.isEmpty() || !r.path("verdict").isString()) throw new IllegalArgumentException();
				var cited = new LinkedHashSet<UUID>();
				for (JsonNode e : r.path("evidence")) {
					try {
						var id = UUID.fromString(e.asString(""));
						if (given.contains(id)) cited.add(id);
					}
					catch (IllegalArgumentException ignored) {
						// Not an id at all: dropped like one that was not given.
					}
				}
				var verdict = Verdict.valueOf(r.path("verdict").asString());
				// Evidence rule: a requirement is only shown as met when something the User gave shows it.
				if (cited.isEmpty()) verdict = Verdict.MISSING;
				requirements.add(new Requirement(cut(text, 500), verdict, List.copyOf(cited), cut(r.path("note").asString("").trim(), 500)));
			}
			return new Fit(score.asInt(), cut(root.path("question").asString("").trim(), 500), requirements);
		}
		catch (RuntimeException e) {
			if (e instanceof ApiException api) throw api;
			throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_BAD_ANSWER",
					"The AI answered in a form CoreEx could not use, so nothing was saved. Try again.");
		}
	}

	/**
	 * Every result of the Application, newest first. A Fit, a Prep, a Debrief summary, or a Draft or Tighten still waiting
	 * for Accept or Reject, is marked out of date when its inputs have changed; a decided answer and a practice attempt are history.
	 */
	public List<Stored> results(UUID owner, UUID applicationId) {
		applications.get(owner, applicationId);
		var rows = jdbc.sql("""
				select id, kind, data::text as data, input_fingerprint, resolution, created_at from career_results
				where owner_id = :owner and item_id = :app order by created_at desc, id""").param("owner", owner)
				.param("app", applicationId).query((rs, n) -> new Object[] { rs.getObject("id", UUID.class), rs.getString("kind"),
						rs.getString("data"), rs.getString("input_fingerprint"), rs.getString("resolution"),
						rs.getObject("created_at", OffsetDateTime.class).toInstant() })
				.list();
		var current = new HashMap<String, String>();
		var stored = new ArrayList<Stored>();
		for (var r : rows) {
			var kind = (String) r[1];
			var data = (String) r[2];
			var resolution = (String) r[4];
			Object result;
			CareerTask task = null;
			Subject subject = Subject.NONE;
			switch (kind) {
				case "FIT" -> {
					result = json.readValue(data, Fit.class);
					task = CareerTask.FIT;
				}
				case "PREP" -> {
					var prep = json.readValue(data, Prep.class);
					result = prep;
					task = CareerTask.PREP;
					subject = Subject.interview(prep.interviewSeq());
				}
				case "DEBRIEF" -> {
					var summary = json.readValue(data, Summary.class);
					result = summary;
					task = CareerTask.DEBRIEF;
					subject = Subject.interview(summary.interviewSeq());
				}
				case "EMAIL", "FOLLOW_UP", "THANK_YOU" -> {
					var email = json.readValue(data, Email.class);
					result = email;
					task = switch (kind) {
						case "EMAIL" -> CareerTask.EMAIL;
						case "FOLLOW_UP" -> CareerTask.FOLLOW_UP;
						default -> CareerTask.THANK_YOU;
					};
					if (email.interviewSeq() != null) subject = new Subject(null, email.interviewSeq(), null, null);
				}
				case "PRACTICE" -> result = json.readValue(data, Practice.class);
				default -> {
					var answer = json.readValue(data, Answer.class);
					result = answer;
					if (resolution == null) {
						task = kind.equals("DRAFT") ? CareerTask.DRAFT : CareerTask.TIGHTEN;
						subject = Subject.question(answer.questionId());
					}
				}
			}
			var outOfDate = false;
			if (task != null) {
				var t = task;
				var s = subject;
				var now = current.computeIfAbsent(kind + s, k -> {
					try {
						return gather(owner, applicationId, t, s).fingerprint();
					}
					catch (ApiException gone) {
						return ""; // the question, interview or Debrief was deleted
					}
				});
				outOfDate = !r[3].equals(now);
			}
			stored.add(new Stored((UUID) r[0], kind, result, resolution, outOfDate, (Instant) r[5]));
		}
		return stored;
	}

	/** What each cited id is now: forgotten, switched-off or deleted evidence no longer resolves and is left out. */
	public Map<UUID, Evidence> evidence(UUID owner, Set<UUID> ids) {
		var found = new HashMap<UUID, Evidence>();
		if (ids.isEmpty()) return found;
		jdbc.sql("select id, text from facts where owner_id = :owner and status = 'ACTIVE' and id in (:ids)").param("owner", owner)
				.param("ids", ids).query((rs, n) -> found.put(rs.getObject("id", UUID.class),
						new Evidence(rs.getObject("id", UUID.class), "FACT", rs.getString("text"))))
				.list();
		jdbc.sql("select id, type, title from items where owner_id = :owner and deleted_at is null and id in (:ids)")
				.param("owner", owner).param("ids", ids)
				.query((rs, n) -> found.put(rs.getObject("id", UUID.class), new Evidence(rs.getObject("id", UUID.class),
						rs.getString("type").equals("RESUME") ? "RESUME" : "STORY", rs.getString("title"))))
				.list();
		return found;
	}

	/** The latest Fit score of each listed Application that has one, for the List. */
	public Map<UUID, Integer> matchScores(UUID owner, List<UUID> applicationIds) {
		var scores = new LinkedHashMap<UUID, Integer>();
		if (applicationIds.isEmpty()) return scores;
		jdbc.sql("""
				select distinct on (item_id) item_id, (data ->> 'score')::int as score from career_results
				where owner_id = :owner and kind = 'FIT' and item_id in (:ids) order by item_id, created_at desc""")
				.param("owner", owner).param("ids", applicationIds)
				.query((rs, n) -> scores.put(rs.getObject("item_id", UUID.class), rs.getInt("score"))).list();
		return scores;
	}

}
