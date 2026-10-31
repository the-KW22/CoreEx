package com.coreex.items;

import java.util.regex.Pattern;

/** A short plain-text preview of a Note's Markdown, for the Item cards. */
final class Snippet {

	static final int MAX = 160;

	private static final Pattern LINE_MARK = Pattern.compile("^\\s*(#{1,6}\\s+|>\\s*|[-*+]\\s+(\\[[ xX]]\\s+)?|\\d+\\.\\s+)");

	// A stored Link is [[id|Title]]; keep only the title.
	private static final Pattern LINK = Pattern.compile("\\[\\[(?:[^\\]|]*\\|)?([^\\]]*)]]");

	private static final Pattern MARKDOWN_LINK = Pattern.compile("!?\\[([^\\]]*)]\\([^)]*\\)");

	// shortcut: marks are stripped with regexes, not a parser, so snake_case loses its underscores and code fences show
	// raw, upgrade to a Markdown parser if previews look wrong.
	private static final Pattern EMPHASIS = Pattern.compile("[*_`~]");

	private Snippet() {
	}

	/** Null when there is no text. The first line is left out when it is the heading that repeats the title. */
	static String of(String title, String body) {
		if (body == null) {
			return null;
		}
		var lines = body.strip().lines().toList();
		if (!lines.isEmpty() && lines.get(0).strip().equals("# " + title.strip())) {
			lines = lines.subList(1, lines.size());
		}
		var text = String.join(" ", lines.stream().map(l -> LINE_MARK.matcher(l).replaceFirst("")).toList());
		text = EMPHASIS.matcher(MARKDOWN_LINK.matcher(LINK.matcher(text).replaceAll("$1")).replaceAll("$1")).replaceAll("")
				.replaceAll("\\s+", " ").strip();
		if (text.isEmpty()) {
			return null;
		}
		if (text.length() <= MAX) {
			return text;
		}
		var cut = text.lastIndexOf(' ', MAX);
		return text.substring(0, cut > 0 ? cut : MAX) + "…";
	}

}
