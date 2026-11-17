package com.coreex.career;

import java.util.Optional;

/** Two Offers compare only in the same currency and pay period; CoreEx never converts money. */
final class OfferComparison {

	private OfferComparison() {
	}

	/** Why the two cannot be compared, or empty when they can. */
	static Optional<String> refusal(OfferTerms a, OfferTerms b) {
		if (!paid(a) || !paid(b)) {
			return Optional.of("Both Offers need a base pay, a currency and a pay period to be compared.");
		}
		if (!a.currency().equals(b.currency())) {
			return Optional.of("These Offers are in " + a.currency() + " and " + b.currency() + "; CoreEx does not convert currency.");
		}
		if (!a.payPeriod().equals(b.payPeriod())) {
			return Optional.of("One is paid per " + OfferTerms.per(a.payPeriod()) + " and the other per " + OfferTerms.per(b.payPeriod()) + ".");
		}
		return Optional.empty();
	}

	private static boolean paid(OfferTerms t) {
		return t.basePay() != null && t.currency() != null && t.payPeriod() != null;
	}

}
