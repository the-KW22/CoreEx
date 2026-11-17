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

	public record Stored(UUID id, String kind, Fit fit, boolean outOfDate, Instant createdAt) {
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
		return Map.of(CareerTask.FIT.kind(), CareerTask.FIT.sends());
	}

	/** Runs the Fit check and stores its result. */
	public Stored fit(UUID owner, UUID applicationId) {
		var task = CareerTask.FIT;
		var posting = applications.get(owner, applicationId).postingText();
		if (posting == null || posting.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Add the posting text to this Application first.");
		}
		var before = gather(owner, applicationId, task);
		var reply = ai.askWithUse(owner, task.system(), before.data(), task.schema());
		var fit = parseFit(reply.text(), before.ids());
		var evidence = fit.requirements().stream().flatMap(r -> r.evidence().stream())
				.collect(Collectors.toCollection(LinkedHashSet::new));
		var stored = tx.execute(status -> {
			// The inputs and the Application are read again here: a result for inputs that changed during the call is refused.
			var now = gather(owner, applicationId, task);
			if (!now.fingerprint().equals(before.fingerprint())) {
				throw new ApiException(HttpStatus.CONFLICT, "CONFLICT",
						"Your posting or Knowledge changed while the AI was working. Run the check again.");
			}
			return jdbc.sql("""
					insert into career_results (owner_id, item_id, kind, data, evidence_ids, input_fingerprint, input_tokens, output_tokens)
					select :owner, i.id, :kind, :data::jsonb, :evidence, :fingerprint, :in, :out from items i
					where i.id = :app and i.owner_id = :owner and i.deleted_at is null returning id, created_at""")
					.param("owner", owner).param("app", applicationId).param("kind", task.kind())
					.param("data", json.writeValueAsString(fit)).param("evidence", evidence.toArray(UUID[]::new))
					.param("fingerprint", now.fingerprint()).param("in", reply.inputTokens()).param("out", reply.outputTokens())
					.query((rs, n) -> new Stored(rs.getObject("id", UUID.class), task.kind(), fit, false,
							rs.getObject("created_at", OffsetDateTime.class).toInstant()))
					.optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Application not found."));
		});
		return stored;
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

	/** Every result of the Application, newest first, each marked out of date when its inputs have changed. */
	public List<Stored> results(UUID owner, UUID applicationId) {
		applications.get(owner, applicationId);
		var rows = jdbc.sql("""
				select id, kind, data::text as data, input_fingerprint, created_at from career_results
				where owner_id = :owner and item_id = :app order by created_at desc, id""").param("owner", owner)
				.param("app", applicationId).query((rs, n) -> new Object[] { rs.getObject("id", UUID.class), rs.getString("kind"),
						rs.getString("data"), rs.getString("input_fingerprint"), rs.getObject("created_at", OffsetDateTime.class).toInstant() })
				.list();
		if (rows.isEmpty()) return List.of();
		var current = gather(owner, applicationId, CareerTask.FIT).fingerprint();
		return rows.stream().map(r -> new Stored((UUID) r[0], (String) r[1], json.readValue((String) r[2], Fit.class),
				!r[3].equals(current), (Instant) r[4])).toList();
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
