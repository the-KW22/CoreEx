package com.coreex.resumes;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * The custom rules a Resume may carry (a small CSS): {@code heading { color: #ff0000; font-size: 14 }}. Rules aim at the
 * named parts of the page, and only the properties and values below are accepted; anything else is refused, so the
 * renderer never sees a rule it cannot draw. The frontend has the same lists (lib/resume/custom-css.ts).
 */
final class ResumeCss {

	static final int MAX_LENGTH = 5000;

	static final Set<String> PARTS = Set.of("name", "headline", "contact", "heading", "text", "entry", "entry-title",
			"entry-subtitle", "entry-dates");

	private static final Pattern HEX = Pattern.compile("#[0-9a-fA-F]{6}");

	private static final Pattern POINTS = Pattern.compile("(\\d{1,2})(\\.\\d)?(pt)?");

	private static final Map<String, Predicate<String>> PROPERTIES = Map.ofEntries(
			Map.entry("color", v -> HEX.matcher(v).matches()),
			Map.entry("background-color", v -> HEX.matcher(v).matches()),
			Map.entry("font-size", v -> points(v, 6, 30)),
			Map.entry("font-weight", v -> Set.of("normal", "bold").contains(v)),
			Map.entry("font-style", v -> Set.of("normal", "italic").contains(v)),
			Map.entry("text-align", v -> Set.of("left", "center", "right", "justify").contains(v)),
			Map.entry("text-transform", v -> Set.of("none", "uppercase", "lowercase", "capitalize").contains(v)),
			Map.entry("text-decoration", v -> Set.of("none", "underline").contains(v)),
			Map.entry("margin-top", v -> points(v, 0, 60)),
			Map.entry("margin-bottom", v -> points(v, 0, 60)),
			Map.entry("padding-top", v -> points(v, 0, 60)),
			Map.entry("padding-bottom", v -> points(v, 0, 60)));

	private ResumeCss() {
	}

	private static boolean points(String value, int low, int high) {
		var m = POINTS.matcher(value);
		if (!m.matches()) {
			return false;
		}
		var n = Double.parseDouble(m.group(1) + (m.group(2) == null ? "" : m.group(2)));
		return n >= low && n <= high;
	}

	/** What is wrong with the rules, one sentence each; empty when they are fine. */
	static List<String> problems(String css) {
		var found = new ArrayList<String>();
		if (css == null || css.isBlank()) {
			return found;
		}
		if (css.length() > MAX_LENGTH) {
			found.add("The custom style is longer than " + MAX_LENGTH + " characters.");
			return found;
		}
		var text = css.replaceAll("(?s)/\\*.*?\\*/", " ").strip();
		if (text.isEmpty()) {
			return found;
		}
		if (!text.endsWith("}")) {
			found.add("A rule is not closed with }.");
			return found;
		}
		for (var rule : text.substring(0, text.length() - 1).split("}", -1)) {
			var open = rule.indexOf('{');
			if (open < 0 || rule.indexOf('{', open + 1) >= 0) {
				found.add("Each rule is a part name and then { ... }.");
				continue;
			}
			for (var selector : rule.substring(0, open).split(",")) {
				if (!PARTS.contains(selector.strip())) {
					found.add("\"" + selector.strip() + "\" is not a part of the page.");
				}
			}
			for (var declaration : rule.substring(open + 1).split(";")) {
				if (declaration.isBlank()) {
					continue;
				}
				var colon = declaration.indexOf(':');
				var property = colon < 0 ? declaration.strip() : declaration.substring(0, colon).strip().toLowerCase();
				var value = colon < 0 ? "" : declaration.substring(colon + 1).strip();
				var check = PROPERTIES.get(property);
				if (check == null) {
					found.add("\"" + property + "\" is not a property you can set.");
				}
				else if (!check.test(value)) {
					found.add("\"" + value + "\" is not a value for " + property + ".");
				}
			}
		}
		return found;
	}

}
