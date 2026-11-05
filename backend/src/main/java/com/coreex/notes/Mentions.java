package com.coreex.notes;

import java.util.regex.Pattern;

import com.coreex.links.LinkParser;

/**
 * Finds a plain mention of a title in a Note's Markdown: the exact title, ignoring case, as whole words, outside code,
 * Links, Markdown links and URLs, where wrapping it in [[ ]] would break the text. Pure text work, so it is unit tested
 * without a database.
 */
final class Mentions {

	/** Shorter titles match too much to be worth listing. */
	static final int MIN_TITLE = 3;

	private static final Pattern NOT_PROSE = Pattern
			.compile("\\[\\[[^\\]\\n]*]]|!?\\[[^\\]\\n]*]\\([^)\\n]*\\)|https?://\\S+");

	private Mentions() {
	}

	/** Where the first mention starts, or -1. A title that cannot sit inside [[ ]] has none. */
	static int first(String markdown, String title) {
		if (title.length() < MIN_TITLE || title.chars().anyMatch(c -> c == '[' || c == ']' || c == '|' || c == '\n')) {
			return -1;
		}
		var prose = NOT_PROSE.matcher(LinkParser.withoutCode(markdown))
				.replaceAll(m -> " ".repeat(m.group().length()));
		for (var at = 0; at <= prose.length() - title.length(); at++) {
			if (prose.regionMatches(true, at, title, 0, title.length()) && !isWord(prose, at - 1)
					&& !isWord(prose, at + title.length())) {
				return at;
			}
		}
		return -1;
	}

	private static boolean isWord(String text, int at) {
		return at >= 0 && at < text.length() && Character.isLetterOrDigit(text.charAt(at));
	}

}
