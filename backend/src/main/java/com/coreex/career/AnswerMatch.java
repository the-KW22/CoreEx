package com.coreex.career;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Plain local word matching, no AI (decision C14).
final class AnswerMatch {

	static final double THRESHOLD = 0.34;

	private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]+");
	// "why" is listed once: Set.of rejects duplicates.
	private static final Set<String> STOP = Set.of("the", "and", "for", "are", "you", "your", "with", "that", "this",
			"what", "why", "how", "have", "has", "was", "were", "our", "from", "about", "would", "could", "should", "tell",
			"describe", "please", "explain");

	private AnswerMatch() {}

	static double score(String a, String b) {
		Set<String> x = tokens(a);
		Set<String> y = tokens(b);
		if (x.isEmpty() || y.isEmpty()) return 0;
		Set<String> both = new HashSet<>(x);
		both.retainAll(y);
		Set<String> either = new HashSet<>(x);
		either.addAll(y);
		return (double) both.size() / either.size();
	}

	private static Set<String> tokens(String text) {
		Set<String> out = new HashSet<>();
		if (text == null) return out;
		Matcher m = WORD.matcher(text.toLowerCase(Locale.ROOT));
		while (m.find()) {
			String word = m.group();
			if (word.codePointCount(0, word.length()) >= 3 && !STOP.contains(word)) out.add(word);
		}
		return out;
	}
}
