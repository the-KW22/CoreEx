package com.coreex.career;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Locale;

/** An Offer's terms. Every term is optional: null is unknown, so blank text becomes null and a number is never 0 by default. */
public record OfferTerms(BigDecimal basePay, String currency, String payPeriod, String bonus, String equity, String benefits,
		LocalDate startDate, String place, Integer officeDays, LocalDate respondBy) {

	public OfferTerms {
		currency = blankToNull(currency);
		payPeriod = blankToNull(payPeriod);
		bonus = blankToNull(bonus);
		equity = blankToNull(equity);
		benefits = blankToNull(benefits);
		place = blankToNull(place);
	}

	/** The pay period as a word for a message, such as "year". */
	static String per(String payPeriod) {
		return payPeriod.toLowerCase(Locale.ROOT);
	}

	private static String blankToNull(String text) {
		return text == null || text.isBlank() ? null : text.strip();
	}

}
