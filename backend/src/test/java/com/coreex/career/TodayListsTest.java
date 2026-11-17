package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.coreex.applications.Application;
import com.coreex.applications.Application.Stage;
import com.coreex.applications.Application.TimelineEntry;
import com.coreex.career.TodayLists.Entry;
import com.coreex.career.TodayLists.Kind;
import com.coreex.career.TodayLists.OfferDeadline;

/** The Today lists, with the clock and the timezone passed in. */
class TodayListsTest {

	private static final Instant NOW = Instant.parse("2026-11-20T08:30:00Z");

	private static final ZoneId UTC = ZoneId.of("UTC");

	private static final ZoneId AUCKLAND = ZoneId.of("Pacific/Auckland");

	private static Application app(String title, Stage stage, LocalDate reminderOn, LocalTime reminderTime,
			TimelineEntry... entries) {
		return new Application(UUID.randomUUID(), title, true, "c", "r", "", "", "", stage, null, null, reminderOn,
				reminderTime, List.of(entries), 1, null, NOW, NOW);
	}

	private static TimelineEntry stage(Stage stage, Instant at, int seq) {
		return new TimelineEntry("STAGE", stage, at, seq, null, null);
	}

	private static TimelineEntry interview(Instant start, int seq) {
		return new TimelineEntry("INTERVIEW", null, start, seq, "", "VIDEO");
	}

	@Test
	void needsYouHoldsDueFollowUpAndOfferAndLeavesOutWaitingAndClosed() {
		var followUp = app("Follow", Stage.APPLIED, LocalDate.of(2026, 11, 19), null);
		var offer = app("Offer", Stage.OFFER, null, null, stage(Stage.OFFER, NOW.minus(Duration.ofDays(2)), 1));
		var waiting = app("Waiting", Stage.APPLIED, null, null);
		var closed = app("Closed", Stage.CLOSED, LocalDate.of(2026, 11, 19), null,
				stage(Stage.CLOSED, NOW.minus(Duration.ofDays(1)), 1), interview(NOW.plusSeconds(3600 * 3), 2));

		var today = TodayLists.of(List.of(followUp, offer, waiting, closed), List.of(), NOW, UTC);

		assertThat(today.needsYou()).extracting(Entry::title).containsExactly("Offer", "Follow");
		assertThat(today.needsYou()).allSatisfy(e -> assertThat(e.kind()).isEqualTo(Kind.NEXT_STEP));
		assertThat(today.comingUp()).isEmpty();
	}

	@Test
	void interviewWithin24hIsNeedsYouOnceAndALaterInterviewIsComingUp() {
		var acme = app("Acme", Stage.INTERVIEW, null, null, interview(NOW.plusSeconds(3600 * 3), 1),
				interview(NOW.plus(Duration.ofDays(3)), 2));

		var today = TodayLists.of(List.of(acme), List.of(), NOW, UTC);

		assertThat(today.needsYou()).singleElement().satisfies(e -> {
			assertThat(e.kind()).isEqualTo(Kind.NEXT_STEP);
			assertThat(e.label()).isEqualTo("Interview Nov 20, 11:30");
			assertThat(e.at()).isEqualTo(NOW.plusSeconds(3600 * 3));
			assertThat(e.interviewSeq()).isEqualTo(1);
			assertThat(e.withinDay()).isTrue();
		});
		assertThat(today.comingUp()).singleElement().satisfies(e -> {
			assertThat(e.kind()).isEqualTo(Kind.INTERVIEW);
			assertThat(e.label()).isEqualTo("Interview Nov 23, 08:30");
			assertThat(e.interviewSeq()).isEqualTo(2);
			assertThat(e.withinDay()).isFalse();
		});
	}

	@Test
	void anInterviewWithin24hThatIsNotNeedsYouIsComingUpWithinDay() {
		var offer = app("Offer", Stage.OFFER, null, null, stage(Stage.OFFER, NOW.minus(Duration.ofDays(1)), 1),
				interview(NOW.plusSeconds(3600 * 5), 2));

		var today = TodayLists.of(List.of(offer), List.of(), NOW, UTC);

		assertThat(today.comingUp()).singleElement().satisfies(e -> {
			assertThat(e.kind()).isEqualTo(Kind.INTERVIEW);
			assertThat(e.interviewSeq()).isEqualTo(2);
			assertThat(e.withinDay()).isTrue();
		});
	}

	@Test
	void aFutureFollowUpIsComingUpAndNotNeedsYou() {
		var later = app("Later", Stage.APPLIED, LocalDate.of(2026, 11, 22), LocalTime.of(9, 0));

		var today = TodayLists.of(List.of(later), List.of(), NOW, UTC);

		assertThat(today.needsYou()).isEmpty();
		assertThat(today.comingUp()).singleElement().satisfies(e -> {
			assertThat(e.kind()).isEqualTo(Kind.FOLLOW_UP);
			assertThat(e.label()).isEqualTo("Follow up");
			assertThat(e.at()).isEqualTo(Instant.parse("2026-11-22T09:00:00Z"));
			assertThat(e.interviewSeq()).isNull();
			assertThat(e.withinDay()).isFalse();
		});
	}

	@Test
	void offerDeadlineTodayIsListedYesterdaysIsNotAndClosedIsNever() {
		var offer = app("Offer", Stage.OFFER, null, null, stage(Stage.OFFER, NOW.minus(Duration.ofDays(2)), 1));
		var old = app("Old", Stage.SCREENING, null, null);
		var closed = app("Closed", Stage.CLOSED, null, null, stage(Stage.CLOSED, NOW.minus(Duration.ofDays(1)), 1));
		var deadlines = List.of(new OfferDeadline(offer.id(), LocalDate.of(2026, 11, 20)),
				new OfferDeadline(old.id(), LocalDate.of(2026, 11, 19)),
				new OfferDeadline(closed.id(), LocalDate.of(2026, 11, 21)));

		var today = TodayLists.of(List.of(offer, old, closed), deadlines, NOW, UTC);

		assertThat(today.comingUp()).singleElement().satisfies(e -> {
			assertThat(e.kind()).isEqualTo(Kind.OFFER_DEADLINE);
			assertThat(e.title()).isEqualTo("Offer");
			assertThat(e.label()).isEqualTo("Offer respond-by Nov 20");
			assertThat(e.at()).isEqualTo(Instant.parse("2026-11-20T00:00:00Z"));
		});
	}

	@Test
	void theUsersZoneDecidesWhetherADefaultNineOClockReminderIsDue() {
		// 09:00 on Nov 20 was 20:00 on Nov 19 UTC in Auckland (already past), but 09:00 UTC is still ahead of NOW.
		var reminder = app("Remind", Stage.APPLIED, LocalDate.of(2026, 11, 20), null);

		var inAuckland = TodayLists.of(List.of(reminder), List.of(), NOW, AUCKLAND);
		assertThat(inAuckland.needsYou()).extracting(Entry::title).containsExactly("Remind");
		assertThat(inAuckland.comingUp()).isEmpty();

		var inUtc = TodayLists.of(List.of(reminder), List.of(), NOW, UTC);
		assertThat(inUtc.needsYou()).isEmpty();
		assertThat(inUtc.comingUp()).singleElement()
				.satisfies(e -> assertThat(e.at()).isEqualTo(Instant.parse("2026-11-20T09:00:00Z")));
	}

	@Test
	void theUsersZoneDecidesWhichDayAnOfferRespondByIsToday() {
		// At 14:00 UTC on Nov 20 it is already 03:00 on Nov 21 in Auckland, so Nov 20 is yesterday there.
		var now = Instant.parse("2026-11-20T14:00:00Z");
		var offer = app("Offer", Stage.SCREENING, null, null);
		var deadlines = List.of(new OfferDeadline(offer.id(), LocalDate.of(2026, 11, 20)));

		assertThat(TodayLists.of(List.of(offer), deadlines, now, UTC).comingUp()).singleElement()
				.satisfies(e -> assertThat(e.at()).isEqualTo(Instant.parse("2026-11-20T00:00:00Z")));
		assertThat(TodayLists.of(List.of(offer), deadlines, now, AUCKLAND).comingUp()).isEmpty();
	}

	@Test
	void needsYouIsOrderedByDueMoment() {
		var older = app("Older", Stage.APPLIED, LocalDate.of(2026, 11, 18), null);
		var newer = app("Newer", Stage.APPLIED, LocalDate.of(2026, 11, 19), null);

		var today = TodayLists.of(List.of(newer, older), List.of(), NOW, UTC);

		assertThat(today.needsYou()).extracting(Entry::title).containsExactly("Older", "Newer");
	}

	@Test
	void comingUpIsCappedAt20AndStaysInOrder() {
		var apps = new java.util.ArrayList<Application>();
		for (int i = 1; i <= 25; i++) {
			apps.add(app("Follow " + i, Stage.APPLIED, LocalDate.of(2026, 11, 20).plusDays(i), null));
		}

		var today = TodayLists.of(apps, List.of(), NOW, UTC);

		assertThat(today.comingUp()).hasSize(20);
		assertThat(today.comingUp()).extracting(Entry::at).isSorted();
		assertThat(today.comingUp().get(0).title()).isEqualTo("Follow 1");
		assertThat(today.comingUp().get(19).title()).isEqualTo("Follow 20");
	}
}
