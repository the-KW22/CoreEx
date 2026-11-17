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

	/** Exactly one of {@code fit} and {@code answer} is set. {@code resolution} is null while an answer is waiting for Accept or Reject. */
	public record Stored(UUID id, String kind, Fit fit, Answer answer, String resolution, boolean outOfDate, Instant createdAt) {
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
		return gather(owner, applicationId, task, null);
	}

	/** The same for a task about one form question; 404 when the question is not on this User's Application. */
	Gathered gather(UUID owner, UUID applicationId, CareerTask task, UUID questionId) {
		var application = applications.get(owner, applicationId);
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
				case QUESTION -> {
					var q = question(owner, applicationId, questionId);
					data.append("<question limit=\"").append(q.limitValue() == null ? "none" : q.limitValue() + " " + q.limitUnit().toLowerCase())
							.append("\">").append(esc(q.text())).append("</question>\n");
				}
				case ANSWER -> data.append("<answer>").append(esc(question(owner, applicationId, questionId).answer())).append("</answer>\n");
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
				CareerTask.TIGHTEN.kind(), CareerTask.TIGHTEN.sends());
	}

	/** Runs the Fit check and stores its result. */
	public Stored fit(UUID owner, UUID applicationId) {
		return run(owner, applicationId, CareerTask.FIT, null, CareerService::parseFit,
				"Your posting or Knowledge changed while the AI was working. Run the check again.");
	}

	/** Drafts an answer to a form question from the posting and the User's evidence; kept as a result until accepted or rejected. */
	public Stored draft(UUID owner, UUID applicationId, UUID questionId) {
		question(owner, applicationId, questionId);
		return run(owner, applicationId, CareerTask.DRAFT, questionId, (answer, given) -> parseDraft(questionId, answer, given),
				"Your posting, Knowledge or question changed while the AI was working. Draft again.");
	}

	/** Shortens the current answer without going over the limit; a result that is not shorter or not within the limit is refused. */
	public Stored tighten(UUID owner, UUID applicationId, UUID questionId) {
		var question = question(owner, applicationId, questionId);
		if (question.answer().isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Write an answer first, then tighten it.");
		}
		return run(owner, applicationId, CareerTask.TIGHTEN, questionId, (answer, given) -> parseTighten(question, answer),
				"Your answer changed while the AI was working. Tighten again.");
	}

	private Stored run(UUID owner, UUID applicationId, CareerTask task, UUID questionId,
			java.util.function.BiFunction<String, Set<UUID>, Object> parse, String changed) {
		if (task != CareerTask.TIGHTEN) {
			var posting = applications.get(owner, applicationId).postingText();
			if (posting == null || posting.isBlank()) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Add the posting text to this Application first.");
			}
		}
		var before = gather(owner, applicationId, task, questionId);
		var reply = ai.askWithUse(owner, task.system(), before.data(), task.schema());
		var result = parse.apply(reply.text(), before.ids());
		var fit = result instanceof Fit f ? f : null;
		var answer = result instanceof Answer a ? a : null;
		Set<UUID> evidence = fit != null
				? fit.requirements().stream().flatMap(r -> r.evidence().stream()).collect(Collectors.toCollection(LinkedHashSet::new))
				: new LinkedHashSet<>(answer.evidence());
		return tx.execute(status -> {
			// The inputs and the Application are read again here: a result for inputs that changed during the call is refused.
			var now = gather(owner, applicationId, task, questionId);
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
					.query((rs, n) -> new Stored(rs.getObject("id", UUID.class), task.kind(), fit, answer, null, false,
							rs.getObject("created_at", OffsetDateTime.class).toInstant()))
					.optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Application not found."));
		});
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

	private static ApiException badAnswer() {
		return new ApiException(HttpStatus.BAD_GATEWAY, "AI_BAD_ANSWER",
				"The AI answered in a form CoreEx could not use, so nothing was saved. Try again.");
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
	 * Every result of the Application, newest first. A Fit, or a Draft or Tighten still waiting for Accept or Reject, is
	 * marked out of date when its inputs have changed; a decided one is history.
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
			var created = (Instant) r[5];
			if (kind.equals("FIT")) {
				var now = current.computeIfAbsent("FIT", k -> gather(owner, applicationId, CareerTask.FIT).fingerprint());
				stored.add(new Stored((UUID) r[0], kind, json.readValue((String) r[2], Fit.class), null, null, !r[3].equals(now), created));
				continue;
			}
			var answer = json.readValue((String) r[2], Answer.class);
			var outOfDate = false;
			if (r[4] == null) {
				var task = kind.equals("DRAFT") ? CareerTask.DRAFT : CareerTask.TIGHTEN;
				var now = current.computeIfAbsent(kind + answer.questionId(), k -> {
					try {
						return gather(owner, applicationId, task, answer.questionId()).fingerprint();
					}
					catch (ApiException gone) {
						return ""; // the question was deleted
					}
				});
				outOfDate = !r[3].equals(now);
			}
			stored.add(new Stored((UUID) r[0], kind, null, answer, (String) r[4], outOfDate, created));
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
