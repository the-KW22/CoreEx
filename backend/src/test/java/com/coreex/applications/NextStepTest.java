package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.coreex.applications.Application.Stage;
import com.coreex.applications.Application.TimelineEntry;
import com.coreex.applications.NextStep.Kind;

/** The Next step rule, with the clock and the timezone passed in. */
class NextStepTest {

	private static final Instant NOW = Instant.parse("2026-11-20T12:00:00Z");

	private static final ZoneId UTC = ZoneId.of("UTC");

	private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");

	private static final ZoneId LOS_ANGELES = ZoneId.of("America/Los_Angeles");

	/** An Application in a Stage, with entries written in order, a reminder and the time it was applied. */
	private static Application app(Stage stage, Instant appliedOn, LocalDate reminderOn, LocalTime reminderTime,
			TimelineEntry... entries) {
		var timeline = new ArrayList<>(List.of(entries));
		return new Application(UUID.randomUUID(), "t", true, "c", "r", "", "", "", stage, null, appliedOn, reminderOn,
				reminderTime, timeline, 1, null, NOW, NOW);
	}

	private static TimelineEntry stage(Stage stage, Instant at, int seq) {
		return new TimelineEntry("STAGE", stage, at, seq, null, null);
	}

	private static TimelineEntry interview(Instant start, int seq) {
		return new TimelineEntry("INTERVIEW", null, start, seq, "", "VIDEO");
	}

	private static TimelineEntry entry(String type, Instant at, int seq) {
		return new TimelineEntry(type, null, at, seq, null, null);
	}

	private static Instant ago(Duration by) {
		return NOW.minus(by);
	}

	@Test
	void closedAndOfferComeFirstWhateverElseIsOnTheApplication() {
		var closed = app(Stage.CLOSED, null, LocalDate.of(2026, 11, 1), null,
				stage(Stage.CLOSED, ago(Duration.ofDays(1)), 1));
		assertThat(NextStep.of(closed, NOW, UTC)).satisfies(n -> {
			assertThat(n.kind()).isEqualTo(Kind.CLOSED);
			assertThat(n.due()).isFalse();
		});

		var offer = app(Stage.OFFER, null, null, null, stage(Stage.OFFER, ago(Duration.ofDays(2)), 1),
				interview(NOW.plus(Duration.ofHours(2)), 2));
		var next = NextStep.of(offer, NOW, UTC);
		assertThat(next.kind()).isEqualTo(Kind.OFFER);
		assertThat(next.due()).isTrue();
		assertThat(next.dueAt()).isEqualTo(ago(Duration.ofDays(2)));
	}

	@Test
	void anUpcomingInterviewNeedsTheUserOnlyInTheLastDayAndItsLabelUsesTheUsersTimezone() {
		var start = Instant.parse("2026-11-21T01:30:00Z");
		var soon = app(Stage.INTERVIEW, null, null, null, interview(start, 1));

		var inLosAngeles = NextStep.of(soon, NOW, LOS_ANGELES);
		assertThat(inLosAngeles.kind()).isEqualTo(Kind.INTERVIEW_UPCOMING);
		assertThat(inLosAngeles.label()).isEqualTo("Interview Nov 20, 17:30");
		assertThat(inLosAngeles.due()).isTrue();
		assertThat(NextStep.of(soon, NOW, UTC).label()).isEqualTo("Interview Nov 21, 01:30");

		var later = app(Stage.INTERVIEW, null, null, null, interview(NOW.plus(Duration.ofHours(24)).plusSeconds(1), 1));
		assertThat(NextStep.of(later, NOW, UTC).kind()).isEqualTo(Kind.INTERVIEW_UPCOMING);
		assertThat(NextStep.of(later, NOW, UTC).due()).isFalse();
	}

	@Test
	void anInterviewIsOverOneHourAfterItStartsAndAsksForFeedbackUntilAnyLaterEntry() {
		var inProgress = app(Stage.INTERVIEW, null, null, null, interview(ago(Duration.ofMinutes(59)), 1));
		assertThat(NextStep.of(inProgress, NOW, UTC).kind()).isEqualTo(Kind.WAITING);

		var over = app(Stage.INTERVIEW, null, null, null, interview(ago(Duration.ofHours(1)), 1));
		var next = NextStep.of(over, NOW, UTC);
		assertThat(next.kind()).isEqualTo(Kind.INTERVIEW_FEEDBACK);
		assertThat(next.due()).isTrue();
		assertThat(next.dueAt()).isEqualTo(NOW);

		var noted = app(Stage.INTERVIEW, null, null, null, interview(ago(Duration.ofHours(3)), 1),
				entry("NOTE", ago(Duration.ofHours(1)), 2));
		assertThat(NextStep.of(noted, NOW, UTC).kind()).isEqualTo(Kind.WAITING);

		var both = app(Stage.INTERVIEW, null, null, null, interview(ago(Duration.ofHours(3)), 1),
				interview(NOW.plus(Duration.ofDays(3)), 2));
		assertThat(NextStep.of(both, NOW, UTC).kind()).isEqualTo(Kind.INTERVIEW_UPCOMING);
	}

	@Test
	void aReminderWithoutATimeCountsAtNineInTheUsersTimezone() {
		var day = LocalDate.of(2026, 11, 20);
		var app = app(Stage.SCREENING, null, day, null, stage(Stage.SCREENING, ago(Duration.ofDays(1)), 1));

		// 09:00 in Tokyo is 00:00 UTC and 09:00 in UTC is 09:00 UTC: both are before 12:00 UTC. In Los Angeles it is 17:00 UTC.
		assertThat(NextStep.of(app, NOW, TOKYO)).satisfies(n -> {
			assertThat(n.kind()).isEqualTo(Kind.FOLLOW_UP_DUE);
			assertThat(n.dueAt()).isEqualTo(Instant.parse("2026-11-20T00:00:00Z"));
		});
		assertThat(NextStep.of(app, NOW, UTC).dueAt()).isEqualTo(Instant.parse("2026-11-20T09:00:00Z"));
		assertThat(NextStep.of(app, NOW, LOS_ANGELES).kind()).isEqualTo(Kind.WAITING);

		var timed = app(Stage.SCREENING, null, day, LocalTime.of(11, 59),
				stage(Stage.SCREENING, ago(Duration.ofDays(1)), 1));
		assertThat(NextStep.of(timed, NOW, UTC).kind()).isEqualTo(Kind.FOLLOW_UP_DUE);
		var notYet = app(Stage.SCREENING, null, day, LocalTime.of(12, 1),
				stage(Stage.SCREENING, ago(Duration.ofDays(1)), 1));
		assertThat(NextStep.of(notYet, NOW, UTC).kind()).isEqualTo(Kind.WAITING);
	}

	@Test
	void aSavedApplicationNeedsApplyingUnlessAReminderIsDueFirst() {
		var saved = app(Stage.SAVED, null, null, null, stage(Stage.SAVED, ago(Duration.ofDays(3)), 1));
		assertThat(NextStep.of(saved, NOW, UTC).kind()).isEqualTo(Kind.NOT_APPLIED);

		var reminded = app(Stage.SAVED, null, LocalDate.of(2026, 11, 19), null,
				stage(Stage.SAVED, ago(Duration.ofDays(3)), 1));
		assertThat(NextStep.of(reminded, NOW, UTC).kind()).isEqualTo(Kind.FOLLOW_UP_DUE);
	}

	@Test
	void noReplyForTenDaysSinceAppliedOrTheLastFollowUpNeedsAFollowUp() {
		var appliedTenDaysAgo = ago(Duration.ofDays(10));
		var silent = app(Stage.APPLIED, appliedTenDaysAgo, null, null, stage(Stage.APPLIED, appliedTenDaysAgo, 1));
		assertThat(NextStep.of(silent, NOW, UTC)).satisfies(n -> {
			assertThat(n.kind()).isEqualTo(Kind.NO_REPLY);
			assertThat(n.due()).isTrue();
		});

		var nineDays = ago(Duration.ofDays(9));
		var recent = app(Stage.APPLIED, nineDays, null, null, stage(Stage.APPLIED, nineDays, 1));
		assertThat(NextStep.of(recent, NOW, UTC).kind()).isEqualTo(Kind.WAITING);

		var followedUp = app(Stage.APPLIED, appliedTenDaysAgo, null, null, stage(Stage.APPLIED, appliedTenDaysAgo, 1),
				entry("FOLLOWED_UP", ago(Duration.ofDays(2)), 2));
		assertThat(NextStep.of(followedUp, NOW, UTC).kind()).isEqualTo(Kind.WAITING);
	}

	@Test
	void dueApplicationsSortBeforeOthersAndEarlierDueFirst() {
		var oldOffer = NextStep.of(app(Stage.OFFER, null, null, null, stage(Stage.OFFER, ago(Duration.ofDays(5)), 1)),
				NOW, UTC);
		var newOffer = NextStep.of(app(Stage.OFFER, null, null, null, stage(Stage.OFFER, ago(Duration.ofDays(1)), 1)),
				NOW, UTC);
		var upcoming = NextStep.of(app(Stage.INTERVIEW, null, null, null, interview(NOW.plus(Duration.ofDays(5)), 1)),
				NOW, UTC);
		var waiting = NextStep.of(app(Stage.APPLIED, ago(Duration.ofDays(1)), null, null,
				stage(Stage.APPLIED, ago(Duration.ofDays(1)), 1)), NOW, UTC);

		assertThat(oldOffer.sortKey()).isLessThan(newOffer.sortKey());
		assertThat(newOffer.sortKey()).isLessThan(upcoming.sortKey());
		assertThat(upcoming.sortKey()).isLessThan(waiting.sortKey());
	}

}
