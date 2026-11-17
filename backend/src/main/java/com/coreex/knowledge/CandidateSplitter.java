package com.coreex.knowledge;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Splits a Resume's or Note's text into candidate Facts: one per non-heading line, with any bullet marker removed. */
final class CandidateSplitter {

	private static final Pattern MARKER = Pattern.compile("^(?:[-*+]|\\d+[.)])\\s+");

	private CandidateSplitter() {
	}

	/** Each candidate is an exact piece of the text, so it is also a valid quote. */
	static List<String> split(String text) {
		var candidates = new ArrayList<String>();
		for (var line : text.split("\\R")) {
			var stripped = line.strip();
			if (stripped.isEmpty() || stripped.startsWith("#")) {
				continue;
			}
			var candidate = MARKER.matcher(stripped).replaceFirst("").strip();
			if (!candidate.isEmpty()) {
				candidates.add(candidate);
			}
		}
		return candidates;
	}

}
