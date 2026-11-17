package com.coreex.career;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Removes the quoted history from an employer's email, so a reply is written against the new text only. Pure text work:
 * no model and no database. A message that quotes nothing comes back as it was, apart from the trim.
 */
final class QuotedEmail {

	private static final Pattern QUOTE = Pattern.compile("^\\s*>");

	private static final Pattern ON_WROTE = Pattern.compile("(?i)^\\s*On\\b.*\\bwrote:\\s*$");

	private static final Pattern ON_START = Pattern.compile("(?i)^\\s*On\\b");

	private static final Pattern WROTE_END = Pattern.compile("(?i)\\bwrote:\\s*$");

	private static final Pattern ORIGINAL = Pattern.compile("(?i)^\\s*-+\\s*Original Message\\s*-+\\s*$");

	private static final Pattern HEADER = Pattern.compile("(?i)^\\s*(From|Sent|To|Cc|Subject|Date):");

	private static final Pattern FROM = Pattern.compile("(?i)^\\s*From:");

	private static final Pattern SENT_OR_DATE = Pattern.compile("(?i)^\\s*(Sent|Date):");

	private static final Pattern TO = Pattern.compile("(?i)^\\s*To:");

	private static final Pattern UNDERSCORES = Pattern.compile("^\\s*_{5,}\\s*$");

	private QuotedEmail() {
	}

	/**
	 * The new text of an email: quoted lines and everything from the first history marker on are removed, the blank lines
	 * are kept to two at most, and the result is trimmed. Empty only when the email has no line that is not quoted.
	 */
	static String strip(String raw) {
		var lines = (raw == null ? "" : raw.replace("\r\n", "\n").replace('\r', '\n')).split("\n", -1);
		var kept = new ArrayList<String>();
		for (int i = 0; i < lines.length; i++) {
			if (cutAt(lines, i)) {
				break;
			}
			if (!QUOTE.matcher(lines[i]).find()) {
				kept.add(lines[i]);
			}
		}
		if (kept.stream().allMatch(String::isBlank)) {
			// shortcut: when the only text sits after a history marker, keep the lines that are not quotes, markers or headers, upgrade to a real thread parser if this misreads a reply.
			kept.clear();
			for (int i = 0; i < lines.length; i++) {
				if (!isQuotedOrMarker(lines, i)) {
					kept.add(lines[i]);
				}
			}
		}
		return collapse(kept);
	}

	private static boolean isQuotedOrMarker(String[] lines, int i) {
		var line = lines[i];
		return QUOTE.matcher(line).find() || cutAt(lines, i) || HEADER.matcher(line).find() || WROTE_END.matcher(line).find()
				|| UNDERSCORES.matcher(line).find();
	}

	/** Whether a history marker starts at line {@code i}: an On ... wrote: line (also over two lines), an original-message line, or a header block. */
	private static boolean cutAt(String[] lines, int i) {
		var line = lines[i];
		if (ON_WROTE.matcher(line).find()) {
			return true;
		}
		if (i + 1 < lines.length && ON_START.matcher(line).find() && ON_WROTE.matcher(line + " " + lines[i + 1].strip()).find()) {
			return true;
		}
		if (ORIGINAL.matcher(line).find()) {
			return true;
		}
		if (FROM.matcher(line).find() && headerBlockAfter(lines, i)) {
			return true;
		}
		return UNDERSCORES.matcher(line).find() && i + 1 < lines.length && HEADER.matcher(lines[i + 1]).find();
	}

	/** An Outlook style block: a Sent or Date line and a To line within the next few lines. */
	private static boolean headerBlockAfter(String[] lines, int i) {
		var sent = false;
		var to = false;
		for (int j = i + 1; j < lines.length && j <= i + 4; j++) {
			sent |= SENT_OR_DATE.matcher(lines[j]).find();
			to |= TO.matcher(lines[j]).find();
		}
		return sent && to;
	}

	private static String collapse(List<String> kept) {
		var out = new ArrayList<String>();
		var blank = 0;
		for (var line : kept) {
			if (line.isBlank()) {
				blank++;
				if (blank <= 2) {
					out.add("");
				}
			}
			else {
				blank = 0;
				out.add(line);
			}
		}
		return String.join("\n", out).strip();
	}

}
