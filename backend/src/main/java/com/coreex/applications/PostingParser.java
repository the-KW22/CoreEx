package com.coreex.applications;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads a job posting out of a page: the page's JobPosting data (schema.org, in a JSON-LD script) first, and when
 * there is none the page's title, its site name and its visible text. Everything is cut to what an Application accepts.
 * The page is data: nothing in it is run, and only its text is kept. A page may be 2 MB of anything, so it is read in
 * one pass over its tags (never a pattern that can run over it again and again), and an unclosed tag cannot make that
 * slower.
 */
final class PostingParser {

	/** What was found; empty strings where nothing was. {@code structured} is true when the page had JobPosting data. */
	record Read(String company, String role, String location, String text, boolean structured) {
	}

	// As the Application REST API's limits (ApplicationController).
	private static final int NAME_MAX = 90;

	private static final int LOCATION_MAX = 200;

	private static final int POSTING_MAX = 100_000;

	// What is not part of a posting's text: scripts, styles, and the page's furniture.
	private static final Set<String> NOT_TEXT = Set.of("script", "style", "noscript", "template", "nav", "header", "footer",
			"aside", "form", "svg");

	private static final Set<String> BLOCKS = Set.of("p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr",
			"section", "article", "main", "table", "blockquote");

	private static final Pattern ENTITY = Pattern.compile("&(#x[0-9a-f]+|#\\d+|[a-z]+);", Pattern.CASE_INSENSITIVE);

	private static final Pattern ATTRIBUTE = Pattern
			.compile("([a-zA-Z:-]+)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))");

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private PostingParser() {
	}

	/** What one pass over a page collected. */
	private static final class Scan {

		String title = "";

		String siteName = "";

		final List<String> jsonLd = new ArrayList<>();

		final StringBuilder body = new StringBuilder();

		final StringBuilder all = new StringBuilder();

		boolean sawBody;

	}

	static Read parse(String html) {
		var scan = scan(html == null ? "" : html);
		var posting = findPosting(scan.jsonLd);
		var visible = toText(scan.sawBody ? scan.body.toString() : scan.all.toString(), true);
		var title = clean(scan.title);
		if (posting == null) {
			return new Read(cut(scan.siteName, NAME_MAX), cut(title, NAME_MAX), "", cut(visible, POSTING_MAX), false);
		}
		var company = organisation(posting.path("hiringOrganization"));
		var role = posting.path("title").asString("").trim();
		var text = toText(posting.path("description").asString(""), false);
		return new Read(cut(company.isEmpty() ? scan.siteName : company, NAME_MAX), cut(role.isEmpty() ? title : role, NAME_MAX),
				cut(location(posting), LOCATION_MAX), cut(text.isEmpty() ? visible : text, POSTING_MAX), true);
	}

	/** One pass over the tags. The text between them is kept as it is, with line breaks where blocks end. */
	private static Scan scan(String html) {
		var scan = new Scan();
		var length = html.length();
		var at = 0;
		var skipName = "";
		var skipDepth = 0;
		var nextClose = -1; // the next '>' at or after the last '<' looked at; it never moves back
		while (at < length) {
			var lt = html.indexOf('<', at);
			if (lt < 0) {
				text(scan, html.substring(at), skipDepth > 0);
				break;
			}
			text(scan, html.substring(at, lt), skipDepth > 0);
			if (nextClose < lt) {
				nextClose = html.indexOf('>', lt);
			}
			if (nextClose < 0) {
				break; // an unfinished tag at the very end
			}
			var inner = html.indexOf('<', lt + 1);
			if (inner >= 0 && inner < nextClose) {
				text(scan, "<", skipDepth > 0); // a "<" that opens no tag
				at = lt + 1;
				continue;
			}
			var tag = html.substring(lt + 1, nextClose);
			at = nextClose + 1;
			if (tag.startsWith("!--")) {
				var end = html.indexOf("-->", lt + 4);
				at = end < 0 ? length : end + 3;
				continue;
			}
			var closing = tag.startsWith("/");
			var name = tagName(closing ? tag.substring(1) : tag);
			if (name.isEmpty()) {
				continue;
			}
			if (skipDepth > 0) {
				if (name.equals(skipName)) {
					skipDepth += closing ? -1 : tag.endsWith("/") ? 0 : 1;
				}
				continue;
			}
			if (closing) {
				if (BLOCKS.contains(name)) {
					scan.all.append('\n');
					scan.body.append('\n');
				}
				continue;
			}
			switch (name) {
				case "title" -> {
					var end = indexOfIgnoreCase(html, "</title", at);
					if (scan.title.isEmpty() && end >= 0) {
						scan.title = html.substring(at, end);
					}
					at = end < 0 ? length : end;
				}
				case "meta" -> {
					var attributes = attributes(tag);
					if ("og:site_name".equalsIgnoreCase(attributes.getOrDefault("property", "")) && scan.siteName.isEmpty()) {
						scan.siteName = clean(decode(attributes.getOrDefault("content", "")));
					}
				}
				case "br" -> {
					scan.all.append('\n');
					scan.body.append('\n');
				}
				case "li" -> {
					scan.all.append("\n- ");
					scan.body.append("\n- ");
				}
				case "body" -> scan.sawBody = true;
				default -> {
					if (name.equals("script")) {
						var type = attributes(tag).getOrDefault("type", "").toLowerCase(Locale.ROOT);
						var end = indexOfIgnoreCase(html, "</script", at);
						if (type.contains("application/ld+json") && end >= 0) {
							scan.jsonLd.add(html.substring(at, end));
						}
						at = end < 0 ? length : end; // the closing tag is read next
						skipName = name;
						skipDepth = 1;
					}
					else if (NOT_TEXT.contains(name) && !tag.endsWith("/")) {
						skipName = name;
						skipDepth = 1;
					}
				}
			}
		}
		return scan;
	}

	private static void text(Scan scan, String text, boolean skipping) {
		if (skipping || text.isEmpty()) {
			return;
		}
		scan.all.append(text);
		if (scan.sawBody) {
			scan.body.append(text);
		}
	}

	private static String tagName(String tag) {
		var end = 0;
		while (end < tag.length() && (Character.isLetterOrDigit(tag.charAt(end)))) {
			end++;
		}
		return tag.substring(0, end).toLowerCase(Locale.ROOT);
	}

	private static Map<String, String> attributes(String tag) {
		var found = new HashMap<String, String>();
		var matcher = ATTRIBUTE.matcher(tag);
		while (matcher.find()) {
			var value = matcher.group(2) != null ? matcher.group(2) : matcher.group(3) != null ? matcher.group(3) : matcher.group(4);
			found.putIfAbsent(matcher.group(1).toLowerCase(Locale.ROOT), value);
		}
		return found;
	}

	private static int indexOfIgnoreCase(String text, String what, int from) {
		var last = text.length() - what.length();
		for (var i = Math.max(0, from); i <= last; i++) {
			if (text.regionMatches(true, i, what, 0, what.length())) {
				return i;
			}
		}
		return -1;
	}

	private static JsonNode findPosting(List<String> blocks) {
		for (var block : blocks) {
			try {
				var found = posting(JSON.readTree(block.trim()));
				if (found != null) {
					return found;
				}
			}
			catch (RuntimeException e) {
				// Broken JSON in one script must not hide a good one after it.
			}
		}
		return null;
	}

	private static JsonNode posting(JsonNode node) {
		if (node.isArray()) {
			for (var item : node) {
				var found = posting(item);
				if (found != null) {
					return found;
				}
			}
			return null;
		}
		if (!node.isObject()) {
			return null;
		}
		var type = node.path("@type");
		if (type.isArray() ? contains(type, "JobPosting") : "JobPosting".equals(type.asString(""))) {
			return node;
		}
		return posting(node.path("@graph"));
	}

	private static boolean contains(JsonNode array, String value) {
		for (var item : array) {
			if (value.equals(item.asString(""))) {
				return true;
			}
		}
		return false;
	}

	private static String organisation(JsonNode node) {
		var name = node.isObject() ? node.path("name").asString("") : node.asString("");
		return toText(name, false);
	}

	private static String location(JsonNode posting) {
		var places = new ArrayList<String>();
		if ("TELECOMMUTE".equalsIgnoreCase(posting.path("jobLocationType").asString(""))) {
			places.add("Remote");
		}
		var where = posting.path("jobLocation");
		for (var place : where.isArray() ? where : List.of(where)) {
			var address = place.path("address");
			var parts = new ArrayList<String>();
			if (address.isObject()) {
				for (var key : new String[] { "addressLocality", "addressRegion", "addressCountry" }) {
					var value = address.path(key);
					var text = value.isObject() ? value.path("name").asString("") : value.asString("");
					if (!text.isBlank()) {
						parts.add(text.trim());
					}
				}
			}
			else if (address.isString() && !address.asString("").isBlank()) {
				parts.add(address.asString("").trim());
			}
			if (!parts.isEmpty()) {
				places.add(String.join(", ", parts));
			}
		}
		return String.join("; ", places);
	}

	private static String clean(String text) {
		return decode(text == null ? "" : text).replaceAll("\\s+", " ").trim();
	}

	/**
	 * HTML (or HTML written as escaped text) as plain text: breaks where blocks end, "- " for list items. {@code scanned}
	 * says the text already went through {@link #scan} (its tags are gone), so only entities and spacing are left.
	 */
	static String toText(String html, boolean scanned) {
		var text = html == null ? "" : html;
		if (!scanned) {
			if (!text.contains("<") && text.contains("&lt;")) {
				text = decode(text);
			}
			var found = scan(text);
			text = found.all.toString();
		}
		text = decode(text);
		var lines = new ArrayList<String>();
		var blank = false;
		for (var line : text.split("\n")) {
			var clean = line.replace('\u00a0', ' ').replaceAll("[ \\t]+", " ").trim();
			if (clean.isEmpty()) {
				blank = !lines.isEmpty();
				continue;
			}
			if (blank) {
				lines.add("");
				blank = false;
			}
			lines.add(clean);
		}
		return String.join("\n", lines);
	}

	private static String decode(String text) {
		var out = new StringBuilder();
		var matcher = ENTITY.matcher(text);
		while (matcher.find()) {
			var name = matcher.group(1);
			String replacement;
			if (name.startsWith("#x") || name.startsWith("#X")) {
				replacement = codePoint(name.substring(2), 16);
			}
			else if (name.startsWith("#")) {
				replacement = codePoint(name.substring(1), 10);
			}
			else {
				replacement = switch (name.toLowerCase(Locale.ROOT)) {
					case "amp" -> "&";
					case "lt" -> "<";
					case "gt" -> ">";
					case "quot" -> "\"";
					case "apos" -> "'";
					case "nbsp" -> " ";
					default -> matcher.group();
				};
			}
			matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
		}
		matcher.appendTail(out);
		return out.toString();
	}

	private static String codePoint(String digits, int radix) {
		try {
			var value = Integer.parseInt(digits, radix);
			return Character.isValidCodePoint(value) && value != 0 ? new String(Character.toChars(value)) : "";
		}
		catch (NumberFormatException e) {
			return "";
		}
	}

	private static String cut(String text, int max) {
		var clean = text == null ? "" : text.replace("\u0000", "");
		return clean.length() > max ? clean.substring(0, max) : clean;
	}

}
