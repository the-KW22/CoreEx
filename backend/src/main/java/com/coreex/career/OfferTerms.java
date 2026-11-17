package com.coreex.career;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;

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

	/** The terms a reply's change proposes: a term is set only when the change gives it, the rest are unknown. */
	static OfferTerms fromMap(Map<String, Object> v) {
		return new OfferTerms(v.get("basePay") == null ? null : new BigDecimal((String) v.get("basePay")), (String) v.get("currency"),
				(String) v.get("payPeriod"), (String) v.get("bonus"), (String) v.get("equity"), (String) v.get("benefits"),
				v.get("startDate") == null ? null : LocalDate.parse((String) v.get("startDate")), (String) v.get("place"),
				v.get("officeDays") == null ? null : Integer.valueOf((String) v.get("officeDays")),
				v.get("respondBy") == null ? null : LocalDate.parse((String) v.get("respondBy")));
	}

	/** These terms with every term the other one sets: how a change edits an existing Offer, keeping the rest. */
	OfferTerms overlaid(OfferTerms other) {
		return new OfferTerms(pick(other.basePay, basePay), pick(other.currency, currency), pick(other.payPeriod, payPeriod),
				pick(other.bonus, bonus), pick(other.equity, equity), pick(other.benefits, benefits), pick(other.startDate, startDate),
				pick(other.place, place), pick(other.officeDays, officeDays), pick(other.respondBy, respondBy));
	}

	private static <T> T pick(T proposed, T current) {
		return proposed != null ? proposed : current;
	}

	private static String blankToNull(String text) {
		return text == null || text.isBlank() ? null : text.strip();
	}

}
