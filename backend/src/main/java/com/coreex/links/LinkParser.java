package com.coreex.links;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Finds the Links in a Note's Markdown: {@code [[<item-id>|<title>]]} (stored form) and a hand-typed
 * {@code [[Exact Title]]}. Links inside fenced code blocks and inline code are not Links, and malformed or nested
 * brackets are ignored. Pure text work, so it is unit tested without a database.
 */
public final class LinkParser {

	/**
	 * One Link. {@code start} and {@code end} are the token's position in the text. {@code id} is null for a
	 * hand-typed title; {@code text} is the title, or the display text of a stored Link (maybe empty).
	 */
	public record Occurrence(int start, int end, UUID id, String text) {
	}

	// Inner text has no brackets and no line break, so a nested "[[a [[b]] c]]" yields only "[[b]]".
	private static final Pattern TOKEN = Pattern.compile("\\[\\[([^\\[\\]\\n]+)]]");

	private static final Pattern STORED = Pattern
			.compile("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\\|(.*))?$");

	private LinkParser() {
	}

	public static List<Occurrence> parse(String markdown) {
		var found = new ArrayList<Occurrence>();
		if (markdown == null || markdown.isEmpty()) {
			return found;
		}
		var matcher = TOKEN.matcher(withoutCode(markdown));
		while (matcher.find()) {
			// The token text comes from the original, not the masked copy (they have the same length).
			var inner = markdown.substring(matcher.start(1), matcher.end(1));
			var stored = STORED.matcher(inner);
			if (stored.matches()) {
				var text = stored.group(2);
				found.add(new Occurrence(matcher.start(), matcher.end(), UUID.fromString(stored.group(1)),
						text == null ? "" : text.trim()));
			}
			else if (!inner.isBlank()) {
				found.add(new Occurrence(matcher.start(), matcher.end(), null, inner.trim()));
			}
		}
		return found;
	}

	/** A copy of the text, same length, with fenced code blocks and inline code replaced by spaces. */
	public static String withoutCode(String markdown) {
		var out = markdown.toCharArray();
		var fenceChar = 0;
		var fenceLength = 0;
		var lineStart = 0;
		while (lineStart <= markdown.length()) {
			var lineEnd = markdown.indexOf('\n', lineStart);
			if (lineEnd < 0) {
				lineEnd = markdown.length();
			}
			var line = markdown.substring(lineStart, lineEnd);
			if (fenceChar != 0) {
				blank(out, lineStart, lineEnd);
				if (closesFence(line, fenceChar, fenceLength)) {
					fenceChar = 0;
				}
			}
			else {
				var opened = opensFence(line);
				if (opened > 0) {
					fenceChar = line.stripLeading().charAt(0);
					fenceLength = opened;
					blank(out, lineStart, lineEnd);
				}
				else {
					maskInlineCode(markdown, out, lineStart, lineEnd);
				}
			}
			lineStart = lineEnd + 1;
		}
		return new String(out);
	}

	/** The length of the fence ({@code ```} or {@code ~~~}, at least 3, up to 3 spaces of indent) or 0. */
	private static int opensFence(String line) {
		var indent = line.length() - line.stripLeading().length();
		if (indent > 3) {
			return 0;
		}
		var rest = line.substring(indent);
		if (rest.isEmpty() || (rest.charAt(0) != '`' && rest.charAt(0) != '~')) {
			return 0;
		}
		var run = runLength(rest, 0, rest.charAt(0));
		// A backtick fence's info string may not contain a backtick (that would be inline code).
		if (run < 3 || (rest.charAt(0) == '`' && rest.indexOf('`', run) >= 0)) {
			return 0;
		}
		return run;
	}

	private static boolean closesFence(String line, int fenceChar, int fenceLength) {
		var indent = line.length() - line.stripLeading().length();
		var rest = line.strip();
		return indent <= 3 && !rest.isEmpty() && rest.charAt(0) == fenceChar
				&& runLength(rest, 0, (char) fenceChar) >= fenceLength
				&& runLength(rest, 0, (char) fenceChar) == rest.length();
	}

	/**
	 * Inline code: a run of N backticks up to the next run of exactly N backticks; no closing run, no code. The next
	 * run of each length is worked out in one backwards pass, so a line full of unmatched runs stays linear.
	 */
	private static void maskInlineCode(String text, char[] out, int from, int to) {
		var starts = new ArrayList<Integer>();
		var lengths = new ArrayList<Integer>();
		for (var i = from; i < to;) {
			if (text.charAt(i) == '`') {
				var run = runLength(text, i, '`', to);
				starts.add(i);
				lengths.add(run);
				i += run;
			}
			else {
				i++;
			}
		}
		var next = new int[starts.size()];
		var latestOfLength = new HashMap<Integer, Integer>();
		for (var r = starts.size() - 1; r >= 0; r--) {
			next[r] = latestOfLength.getOrDefault(lengths.get(r), -1);
			latestOfLength.put(lengths.get(r), r);
		}
		for (var r = 0; r < starts.size();) {
			if (next[r] < 0) {
				r++;
			}
			else {
				blank(out, starts.get(r), starts.get(next[r]) + lengths.get(r));
				r = next[r] + 1;
			}
		}
	}

	private static int runLength(String text, int from, char c) {
		return runLength(text, from, c, text.length());
	}

	private static int runLength(String text, int from, char c, int limit) {
		var n = 0;
		while (from + n < limit && text.charAt(from + n) == c) {
			n++;
		}
		return n;
	}

	private static void blank(char[] chars, int from, int to) {
		for (var i = from; i < to; i++) {
			chars[i] = ' ';
		}
	}

}
