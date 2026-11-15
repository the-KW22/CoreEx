package com.coreex.applications;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.Locale;

import com.coreex.applications.Application.Stage;
import com.coreex.applications.Application.TimelineEntry;

/**
 * The one thing an Application needs from the User now. {@code dueAt} is when it became or becomes due (empty when
 * there is no such moment); {@code due} says it needs the User at this moment, which is what Needs you lists.
 * {@code sortKey} orders Applications within a Stage: due ones first, then by {@code dueAt}.
 */
public record NextStep(Kind kind, String label, Instant dueAt, boolean due, long sortKey) {

	/** The kinds, in the order they are tried: the first that fits is the Next step. */
	public enum Kind {
		CLOSED, OFFER, INTERVIEW_UPCOMING, INTERVIEW_FEEDBACK, FOLLOW_UP_DUE, NOT_APPLIED, NO_REPLY, WAITING
	}

	/** An interview counts as ended this long after it starts; no length is stored. */
	static final Duration INTERVIEW_LENGTH = Duration.ofHours(1);

	/** An upcoming interview needs the User (to prepare) from this long before it starts. */
	static final Duration PREPARE_WINDOW = Duration.ofHours(24);

	/** An Applied Application with no reply this long needs a follow-up. */
	static final Duration NO_REPLY_AFTER = Duration.ofDays(10);

	/** A reminder with no time counts at this time in the User's timezone. */
	static final LocalTime DEFAULT_REMINDER_TIME = LocalTime.of(9, 0);

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("MMM d, HH:mm", Locale.US);

	private static final long NOT_DUE = 10_000_000_000_000L;

	private static final long NO_MOMENT = 1_000_000_000_000L;

	/** A pure function of the Application, the current time and the User's timezone. */
	public static NextStep of(Application a, Instant now, ZoneId zone) {
		if (a.stage() == Stage.CLOSED) {
			return new NextStep(Kind.CLOSED, "Closed", null, false, key(false, null));
		}
		if (a.stage() == Stage.OFFER) {
			return due(Kind.OFFER, "Decide on the offer", enteredStage(a, Stage.OFFER));
		}
		var upcoming = a.timeline().stream().filter(e -> e.type().equals("INTERVIEW") && e.at().isAfter(now))
				.min(Comparator.comparing(TimelineEntry::at));
		if (upcoming.isPresent()) {
			var start = upcoming.get().at();
			var soon = !start.isAfter(now.plus(PREPARE_WINDOW));
			var label = "Interview " + WHEN.format(start.atZone(zone));
			return new NextStep(Kind.INTERVIEW_UPCOMING, label, start, soon, key(soon, start));
		}
		var unanswered = a.timeline().stream()
				.filter(e -> e.type().equals("INTERVIEW") && !e.at().plus(INTERVIEW_LENGTH).isAfter(now)
						&& a.timeline().stream().noneMatch(later -> later.seq() > e.seq()))
				.map(e -> e.at().plus(INTERVIEW_LENGTH)).max(Comparator.naturalOrder());
		if (unanswered.isPresent()) {
			return due(Kind.INTERVIEW_FEEDBACK, "Note how the interview went", unanswered.get());
		}
		if (a.reminderOn() != null) {
			var at = a.reminderOn().atTime(a.reminderTime() == null ? DEFAULT_REMINDER_TIME : a.reminderTime())
					.atZone(zone).toInstant();
			if (!at.isAfter(now)) {
				return due(Kind.FOLLOW_UP_DUE, "Follow up", at);
			}
		}
		if (a.stage() == Stage.SAVED) {
			return due(Kind.NOT_APPLIED, "Apply", enteredStage(a, Stage.SAVED));
		}
		if (a.stage() == Stage.APPLIED && a.noReplySince() != null) {
			var silentUntil = a.noReplySince().plus(NO_REPLY_AFTER);
			if (!silentUntil.isAfter(now)) {
				return due(Kind.NO_REPLY, "No reply for 10 days: follow up", silentUntil);
			}
		}
		return new NextStep(Kind.WAITING, "Waiting", null, false, key(false, null));
	}

	private static NextStep due(Kind kind, String label, Instant dueAt) {
		return new NextStep(kind, label, dueAt, true, key(true, dueAt));
	}

	/** When the Application last moved into the Stage, so a long-waiting decision sorts before a new one. */
	private static Instant enteredStage(Application a, Stage stage) {
		return a.timeline().stream().filter(e -> e.type().equals("STAGE") && e.stage() == stage)
				.map(TimelineEntry::at).max(Comparator.naturalOrder()).orElse(null);
	}

	private static long key(boolean due, Instant dueAt) {
		return (due ? 0 : NOT_DUE) + (dueAt == null ? NO_MOMENT : dueAt.getEpochSecond());
	}

}
