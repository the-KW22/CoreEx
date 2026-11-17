package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.coreex.knowledge.KnowledgeRepository.PreferencesRow;

class OfferChecksTest {

	private static OfferTerms offer(String pay, String currency, String period, String place, Integer officeDays) {
		return new OfferTerms(pay == null ? null : new BigDecimal(pay), currency, period, null, null, null, null, place, officeDays, null);
	}

	private static PreferencesRow prefs(String minPay, String currency, String period, List<String> places, Integer officeDays) {
		return new PreferencesRow("", places, minPay == null ? null : new BigDecimal(minPay), currency, period, officeDays, "");
	}

	private static List<String> codes(List<OfferChecks.Check> checks) {
		return checks.stream().map(OfferChecks.Check::code).toList();
	}

	@Test
	void noPreferencesMeansNoChecks() {
		assertThat(OfferChecks.of(offer("1", "GBP", "YEAR", "Berlin", 5), null)).isEmpty();
	}

	@Test
	void payBelowTheMinimumIsFlagged() {
		var checks = OfferChecks.of(offer("40000", "GBP", "YEAR", null, null), prefs("50000", "GBP", "YEAR", List.of(), null));
		assertThat(codes(checks)).containsExactly("BELOW_MINIMUM_PAY");
	}

	@Test
	void payEqualToTheMinimumIsNotFlagged() {
		assertThat(OfferChecks.of(offer("50000", "GBP", "YEAR", null, null), prefs("50000", "GBP", "YEAR", List.of(), null))).isEmpty();
	}

	@Test
	void unknownPayIsNotFlagged() {
		var prefs = prefs("50000", "GBP", "YEAR", List.of(), null);
		assertThat(OfferChecks.of(offer(null, "GBP", "YEAR", null, null), prefs)).isEmpty();
		assertThat(OfferChecks.of(offer("40000", null, "YEAR", null, null), prefs)).isEmpty();
		assertThat(OfferChecks.of(offer("40000", "GBP", null, null, null), prefs)).isEmpty();
	}

	@Test
	void payInOtherUnitsIsNotGuessedAt() {
		var checks = OfferChecks.of(offer("40000", "USD", "MONTH", null, null), prefs("50000", "GBP", "YEAR", List.of(), null));
		assertThat(codes(checks)).containsExactly("CANNOT_CHECK_PAY");
	}

	@Test
	void aPlaceOutsideThePreferredPlacesIsFlagged() {
		var checks = OfferChecks.of(offer(null, null, null, "Berlin office", null), prefs(null, null, null, List.of("REMOTE"), null));
		assertThat(codes(checks)).containsExactly("PLACE_NOT_PREFERRED");
	}

	@Test
	void aPlaceThatContainsAPreferredPlaceIsNotFlagged() {
		assertThat(OfferChecks.of(offer(null, null, null, "Remote, London", null), prefs(null, null, null, List.of("REMOTE"), null))).isEmpty();
		assertThat(OfferChecks.of(offer(null, null, null, "hybrid", null), prefs(null, null, null, List.of("HYBRID"), null))).isEmpty();
	}

	@Test
	void anUnknownPlaceOrNoPreferredPlacesIsNotFlagged() {
		assertThat(OfferChecks.of(offer(null, null, null, null, null), prefs(null, null, null, List.of("REMOTE"), null))).isEmpty();
		assertThat(OfferChecks.of(offer(null, null, null, "Berlin", null), prefs(null, null, null, List.of(), null))).isEmpty();
	}

	@Test
	void moreOfficeDaysThanPreferredIsFlagged() {
		assertThat(codes(OfferChecks.of(offer(null, null, null, null, 3), prefs(null, null, null, List.of(), 2))))
				.containsExactly("MORE_OFFICE_DAYS");
		assertThat(OfferChecks.of(offer(null, null, null, null, 2), prefs(null, null, null, List.of(), 2))).isEmpty();
		assertThat(OfferChecks.of(offer(null, null, null, null, null), prefs(null, null, null, List.of(), 2))).isEmpty();
	}

}
