package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class OfferComparisonTest {

	private static OfferTerms terms(String pay, String currency, String period) {
		return new OfferTerms(pay == null ? null : new BigDecimal(pay), currency, period, null, null, null, null, null, null, null);
	}

	@Test
	void mixedCurrencyIsRefusedAndNamesBothCurrencies() {
		var refusal = OfferComparison.refusal(terms("50000", "GBP", "YEAR"), terms("60000", "USD", "YEAR"));
		assertThat(refusal).hasValue("These Offers are in GBP and USD; CoreEx does not convert currency.");
	}

	@Test
	void mixedPayPeriodIsRefusedAndNamesBothPeriods() {
		var refusal = OfferComparison.refusal(terms("50000", "GBP", "YEAR"), terms("4000", "GBP", "MONTH"));
		assertThat(refusal).hasValue("One is paid per year and the other per month.");
	}

	@Test
	void missingPayCurrencyOrPeriodIsRefused() {
		assertThat(OfferComparison.refusal(terms(null, "GBP", "YEAR"), terms("60000", "GBP", "YEAR"))).isPresent();
		assertThat(OfferComparison.refusal(terms("50000", null, "YEAR"), terms("60000", "GBP", "YEAR"))).isPresent();
		assertThat(OfferComparison.refusal(terms("50000", "GBP", null), terms("60000", "GBP", "YEAR"))).isPresent();
	}

	@Test
	void sameCurrencyAndPeriodAreComparable() {
		assertThat(OfferComparison.refusal(terms("50000", "GBP", "YEAR"), terms("60000", "GBP", "YEAR"))).isEmpty();
	}

}
