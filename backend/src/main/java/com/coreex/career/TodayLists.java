package com.coreex.career;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Stream;

import com.coreex.applications.Application;
import com.coreex.applications.Application.Stage;
import com.coreex.applications.Application.TimelineEntry;
import com.coreex.applications.NextStep;

/** The two lists of the Today page: Needs you, and Coming up. A pure function of its inputs; no clock is read here. */
public final class TodayLists {

	public enum Kind {
		NEXT_STEP, INTERVIEW, FOLLOW_UP, OFFER_DEADLINE
	}

	/** {@code at} is when it is due or happens; {@code interviewSeq} is set only for an interview entry. */
	public record Entry(UUID applicationId, String title, Kind kind, String label, Instant at, Integer interviewSeq,
			boolean withinDay) {
	}

	public record OfferDeadline(UUID applicationId, LocalDate respondBy) {
	}

	public record Today(List<Entry> needsYou, List<Entry> comingUp) {
	}

	/** shortcut: Coming up shows only the first 20 entries with no paging, upgrade when a User has more than 20 upcoming items. */
	private static final int COMING_UP_CAP = 20;

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("MMM d, HH:mm", Locale.US);

	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("MMM d", Locale.US);

	private record Due(Application application, NextStep next) {
	}

	private TodayLists() {
	}

	public static Today of(List<Application> applications, List<OfferDeadline> deadlines, Instant now, ZoneId zone) {
		var open = applications.stream().filter(a -> a.stage() != Stage.CLOSED).toList();

		var needsYou = open.stream().map(a -> new Due(a, NextStep.of(a, now, zone))).filter(d -> d.next().due())
				.sorted(Comparator.comparingLong(d -> d.next().sortKey()))
				.map(d -> needsYouEntry(d.application(), d.next(), now)).toList();

		// An interview already in Needs you is left out of Coming up, so nothing shows twice.
		var shown = needsYou.stream().filter(e -> e.interviewSeq() != null).toList();
		var interviews = open.stream().flatMap(a -> a.timeline().stream()
				.filter(e -> e.type().equals("INTERVIEW") && e.at().isAfter(now))
				.filter(e -> shown.stream().noneMatch(s -> s.applicationId().equals(a.id()) && s.interviewSeq() == e.seq()))
				.map(e -> new Entry(a.id(), a.title(), Kind.INTERVIEW, "Interview " + WHEN.format(e.at().atZone(zone)),
						e.at(), e.seq(), !e.at().isAfter(now.plus(NextStep.PREPARE_WINDOW)))));

		var followUps = open.stream().filter(a -> a.reminderOn() != null)
				.map(a -> new Entry(a.id(), a.title(), Kind.FOLLOW_UP, "Follow up", reminderAt(a, zone), null, false))
				.filter(e -> e.at().isAfter(now));

		var today = now.atZone(zone).toLocalDate();
		var offers = deadlines.stream().filter(d -> !d.respondBy().isBefore(today))
				.flatMap(d -> open.stream().filter(a -> a.id().equals(d.applicationId()))
						.map(a -> new Entry(a.id(), a.title(), Kind.OFFER_DEADLINE,
								"Offer respond-by " + DAY.format(d.respondBy()),
								d.respondBy().atStartOfDay(zone).toInstant(), null, false)));

		var comingUp = Stream.of(interviews, followUps, offers).flatMap(s -> s)
				.sorted(Comparator.comparing(Entry::at)).limit(COMING_UP_CAP).toList();

		return new Today(needsYou, comingUp);
	}

	private static Entry needsYouEntry(Application a, NextStep next, Instant now) {
		if (next.kind() != NextStep.Kind.INTERVIEW_UPCOMING) {
			return new Entry(a.id(), a.title(), Kind.NEXT_STEP, next.label(), next.dueAt(), null, false);
		}
		var interview = a.timeline().stream().filter(e -> e.type().equals("INTERVIEW") && e.at().isAfter(now))
				.min(Comparator.comparing(TimelineEntry::at)).orElseThrow();
		return new Entry(a.id(), a.title(), Kind.NEXT_STEP, next.label(), next.dueAt(), interview.seq(), true);
	}

	private static Instant reminderAt(Application a, ZoneId zone) {
		var time = a.reminderTime() == null ? NextStep.DEFAULT_REMINDER_TIME : a.reminderTime();
		return a.reminderOn().atTime(time).atZone(zone).toInstant();
	}
}
