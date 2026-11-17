package com.coreex.career;

import java.util.Arrays;

final class AnswerLimits {

	enum Unit { WORDS, CHARS }

	private AnswerLimits() {}

	static int count(Unit unit, String text) {
		if (text == null) return 0;
		String trimmed = text.strip();
		if (trimmed.isEmpty()) return 0;
		return switch (unit) {
			// Filter empties: a leading non-breaking space survives strip() and would make split() yield one.
			case WORDS -> (int) Arrays.stream(trimmed.split("(?U)\\s+")).filter(w -> !w.isEmpty()).count();
			case CHARS -> trimmed.codePointCount(0, trimmed.length());
		};
	}

	static boolean within(Unit unit, Integer limit, String text) {
		if (unit == null || limit == null) return true;
		return count(unit, text) <= limit;
	}
}
