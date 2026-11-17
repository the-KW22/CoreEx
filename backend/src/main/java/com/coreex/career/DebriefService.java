package com.coreex.career;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.coreex.applications.ApplicationService;
import com.coreex.common.ApiException;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * What the User records after one interview of an Application: the questions asked, how each answer landed, and notes.
 * One Debrief per interview, linked by the interview's seq in the timeline (checked here, since the timeline is JSON).
 */
@Service
public class DebriefService {

	private static final Set<String> LANDED = Set.of("WELL", "MIXED", "POORLY");

	/** One question asked, and how the answer landed. */
	public record Asked(String question, String landed, String note) {
	}

	public record Debrief(int interviewSeq, Instant interviewAt, String interviewKind, String notes, List<Asked> questions, int version,
			Instant updatedAt) {
	}

	private final JdbcClient jdbc;

	private final ApplicationService applications;

	private final JsonMapper json = JsonMapper.builder().build();

	DebriefService(JdbcClient jdbc, ApplicationService applications) {
		this.jdbc = jdbc;
		this.applications = applications;
	}

	/** The Debriefs of the Application, latest interview first; one whose interview was deleted is hidden (shortcut: it is kept, not purged). */
	public List<Debrief> list(UUID owner, UUID applicationId) {
		var application = applications.get(owner, applicationId);
		return jdbc.sql("""
				select interview_seq, notes, questions::text as questions, version, updated_at from interview_debriefs
				where owner_id = :owner and item_id = :app""").param("owner", owner).param("app", applicationId)
				.query((rs, n) -> {
					var seq = rs.getInt("interview_seq");
					var entry = application.timeline().stream().filter(e -> e.type().equals("INTERVIEW") && e.seq() == seq).findFirst().orElse(null);
					return entry == null ? null : new Debrief(entry.seq(), entry.at(), entry.kind(), rs.getString("notes"),
							json.readValue(rs.getString("questions"), new TypeReference<List<Asked>>() { }), rs.getInt("version"),
							rs.getObject("updated_at", OffsetDateTime.class).toInstant());
				}).list().stream().filter(java.util.Objects::nonNull).sorted(Comparator.comparing(Debrief::interviewAt).reversed()).toList();
	}

	/**
	 * Creates the interview's Debrief (no {@code seenVersion}) or replaces it (the version the User saw); 409 when it
	 * moved or already exists, 404 when the interview is not one of this Application's.
	 */
	public Debrief save(UUID owner, UUID applicationId, int seq, String notes, List<Asked> questions, Integer seenVersion) {
		CareerService.interview(applications.get(owner, applicationId), seq);
		var clean = questions.stream().map(q -> {
			var landed = q.landed() == null ? "" : q.landed();
			if (q.question() == null || q.question().isBlank() || q.question().length() > 1000 || !LANDED.contains(landed)
					|| (q.note() != null && q.note().length() > 2000)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
						"Each question needs its words (up to 1,000 characters) and how it landed: WELL, MIXED or POORLY.");
			}
			return new Asked(q.question().strip(), landed, q.note() == null ? "" : q.note().strip());
		}).toList();
		if (clean.size() > 30 || notes.length() > 10_000) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "A Debrief holds at most 30 questions and 10,000 characters of notes.");
		}
		var written = seenVersion == null
				? jdbc.sql("""
						insert into interview_debriefs (item_id, interview_seq, owner_id, notes, questions) values (:app, :seq, :owner, :notes, :questions::jsonb)
						on conflict do nothing""")
						.param("app", applicationId).param("seq", seq).param("owner", owner).param("notes", notes.strip())
						.param("questions", json.writeValueAsString(clean)).update()
				: jdbc.sql("""
						update interview_debriefs set notes = :notes, questions = :questions::jsonb, version = version + 1, updated_at = now()
						where item_id = :app and interview_seq = :seq and owner_id = :owner and version = :seen""")
						.param("app", applicationId).param("seq", seq).param("owner", owner).param("notes", notes.strip())
						.param("questions", json.writeValueAsString(clean)).param("seen", seenVersion).update();
		if (written == 0) {
			throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "This Debrief changed since you opened it. Reload and try again.");
		}
		return list(owner, applicationId).stream().filter(d -> d.interviewSeq() == seq).findFirst().orElseThrow();
	}

}
