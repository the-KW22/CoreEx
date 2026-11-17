package com.coreex.career;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.coreex.knowledge.KnowledgeRepository.PreferencesRow;

/**
 * Flags an Offer against the User's Preferences. An unknown value is never flagged, and pay in other units is not
 * guessed at: it gets CANNOT_CHECK_PAY instead.
 */
final class OfferChecks {

	public record Check(String code, String message) {
	}

	private OfferChecks() {
	}

	/** No Preferences saved means no checks. */
	static List<Check> of(OfferTerms offer, PreferencesRow prefs) {
		var checks = new ArrayList<Check>();
		if (prefs == null) {
			return checks;
		}
		if (offer.basePay() != null && prefs.minBasePay() != null && offer.currency() != null && offer.payPeriod() != null) {
			if (!offer.currency().equals(prefs.currency()) || !offer.payPeriod().equals(prefs.payPeriod())) {
				checks.add(new Check("CANNOT_CHECK_PAY", "Your minimum is in " + prefs.currency() + " per "
						+ OfferTerms.per(prefs.payPeriod()) + " and this Offer is in " + offer.currency() + " per "
						+ OfferTerms.per(offer.payPeriod()) + ", so CoreEx cannot check it against your minimum."));
			}
			else if (offer.basePay().compareTo(prefs.minBasePay()) < 0) {
				checks.add(new Check("BELOW_MINIMUM_PAY", "Base pay is below your minimum of " + prefs.minBasePay().toPlainString()
						+ " " + prefs.currency() + " per " + OfferTerms.per(prefs.payPeriod()) + "."));
			}
		}
		if (offer.place() != null && !prefs.places().isEmpty() && prefs.places().stream().noneMatch(p -> matches(offer.place(), p))) {
			checks.add(new Check("PLACE_NOT_PREFERRED", "The place (" + offer.place() + ") is not one of your preferred places: "
					+ String.join(", ", prefs.places()) + "."));
		}
		if (offer.officeDays() != null && prefs.officeDays() != null && offer.officeDays() > prefs.officeDays()) {
			checks.add(new Check("MORE_OFFICE_DAYS", "This Offer asks for " + offer.officeDays() + " office days a week; you prefer "
					+ prefs.officeDays() + "."));
		}
		return checks;
	}

	/** Case-insensitive, either way round: "Remote, London" matches REMOTE. */
	private static boolean matches(String place, String preferred) {
		var p = place.toLowerCase(Locale.ROOT);
		var q = preferred.toLowerCase(Locale.ROOT);
		return p.contains(q) || q.contains(p);
	}

}
