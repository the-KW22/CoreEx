package com.coreex.mcp;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;

import com.coreex.common.ApiException;

/**
 * What an Agent may send, checked against the same limits as the REST API. Those limits are annotations on the
 * controllers' request records, which cannot be reused here, so the numbers are repeated: if one changes there, change
 * it here (NoteController, FolderController, TagController, AssetController).
 */
final class Input {

	static final int TITLE_MAX = 200;

	static final int BODY_MAX = 1_000_000;

	static final int TAG_MAX = 50;

	static final int DESCRIPTION_MAX = 2000;

	// A Note whose first line is "# Heading" has that heading as its title (the editor does the same).
	private static final Pattern HEADING = Pattern.compile("^#[ \\t]+(.*?)\\s*$");

	private Input() {
	}

	/** A name or title that must be there: trimmed, not empty, not too long. */
	static String required(String field, String value, int max) {
		var text = value == null ? "" : value.trim();
		if (text.isEmpty()) {
			throw invalid(field + " must not be empty.");
		}
		return optional(field, text, max);
	}

	/** Text that may be empty (or absent, which gives null); checked for length and the NUL character Postgres refuses. */
	static String optional(String field, String value, int max) {
		if (value == null) {
			return null;
		}
		if (value.length() > max) {
			throw invalid(field + " is too long: at most " + max + " characters.");
		}
		if (value.indexOf('\u0000') >= 0) {
			throw invalid(field + " must not contain NUL characters.");
		}
		return value;
	}

	/** A Note's Markdown: required (it may be empty), kept exactly as sent. */
	static String markdown(String value) {
		if (value == null) {
			throw invalid("markdown is required.");
		}
		return optional("markdown", value, BODY_MAX);
	}

	/** The title as the editor would have it: the one given, else the first "# Heading", else {@code fallback}. */
	static String title(String given, String markdown, String fallback) {
		if (given != null && !given.isBlank()) {
			return required("title", given, TITLE_MAX);
		}
		var matcher = HEADING.matcher(markdown.lines().findFirst().orElse(""));
		if (matcher.matches()) {
			var heading = matcher.group(1);
			return heading.length() > TITLE_MAX ? heading.substring(0, TITLE_MAX) : heading;
		}
		return fallback;
	}

	/** Tag names, each valid, once each (ignoring case, as Tags are), in the order given. A null list is empty. */
	static List<String> tagNames(List<String> names) {
		var unique = new LinkedHashMap<String, String>();
		if (names != null) {
			names.forEach(n -> unique.putIfAbsent(required("tag name", n, TAG_MAX).toLowerCase(Locale.ROOT), n.trim()));
		}
		return List.copyOf(unique.values());
	}

	static ApiException invalid(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
	}

}
