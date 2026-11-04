package com.coreex.items;

import java.util.List;
import java.util.regex.Pattern;

/** A short plain-text preview of a Note's Markdown, for the Item cards. */
final class Snippet {

	static final int MAX = 160;

	// Repeated, so a nested "> - item" loses both marks.
	private static final Pattern LINE_MARK = Pattern.compile("^\\s*(#{1,6}\\s+|>\\s*|[-*+]\\s+(\\[[ xX]]\\s+)?|\\d+[.)]\\s+)+");

	// A line with nothing to read: a rule or setext underline, a code fence (the code inside stays), a table separator.
	private static final Pattern SYNTAX_LINE = Pattern.compile("\\s*(([-*_=]\\s*){3,}|(```|~~~).*|(?=.*\\|)[\\s:|-]+)");

	// What the first line of a front matter block looks like, so two rules around ordinary text are not mistaken for one.
	private static final Pattern YAML_KEY = Pattern.compile("[\\w-]+:(\\s.*)?");

	// A stored Link is [[id|Title]]; keep only the title.
	private static final Pattern LINK = Pattern.compile("\\[\\[(?:[^\\]|]*\\|)?([^\\]]*)]]");

	private static final Pattern MARKDOWN_LINK = Pattern.compile("!?\\[([^\\]]*)]\\([^)]*\\)");

	// shortcut: marks are stripped with regexes, not a parser, so snake_case loses its underscores, upgrade to a Markdown
	// parser if previews look wrong.
	private static final Pattern EMPHASIS = Pattern.compile("[*_`~]");

	private Snippet() {
	}

	/**
	 * Null when there is no text. Leaves out a leading front matter block and the heading that repeats the title, in
	 * either order: the title field puts its heading in front of a block that was there first.
	 */
	static String of(String title, String body) {
		if (body == null) {
			return null;
		}
		var lines = withoutTitle(withoutFrontMatter(withoutTitle(body.strip().lines().toList(), title)), title);
		var text = String.join(" ", lines.stream().filter(l -> !SYNTAX_LINE.matcher(l).matches())
				.map(l -> LINE_MARK.matcher(l).replaceFirst("")).toList());
		// Links first: a stored Link has a "|" of its own, and any other "|" left is a table's.
		text = EMPHASIS.matcher(MARKDOWN_LINK.matcher(LINK.matcher(text).replaceAll("$1")).replaceAll("$1")).replaceAll("")
				.replace('|', ' ').replaceAll("\\s+", " ").strip();
		if (text.isEmpty()) {
			return null;
		}
		if (text.length() <= MAX) {
			return text;
		}
		var cut = text.lastIndexOf(' ', MAX);
		return text.substring(0, cut > 0 ? cut : MAX) + "…";
	}

	private static List<String> withoutTitle(List<String> lines, String title) {
		var rest = lines.stream().dropWhile(String::isBlank).toList();
		return !rest.isEmpty() && rest.get(0).strip().equals("# " + title.strip()) ? rest.subList(1, rest.size()) : rest;
	}

	/** A block that never closes counts as all front matter: only the start of the body is read, so it may end later. */
	private static List<String> withoutFrontMatter(List<String> lines) {
		var rest = lines.stream().dropWhile(String::isBlank).toList();
		if (rest.size() < 2 || !rest.get(0).strip().equals("---") || !YAML_KEY.matcher(rest.get(1)).matches()) {
			return rest;
		}
		for (var i = 2; i < rest.size(); i++) {
			if (rest.get(i).strip().equals("---")) {
				return rest.subList(i + 1, rest.size());
			}
		}
		return List.of();
	}

}
