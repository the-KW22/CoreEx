package com.coreex.resumes;

import java.net.URI;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.jsoup.Jsoup;

/** The score of the frontend's deterministic Resume Check, saved with a sent version. */
public final class ResumeCheckScore {

	private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
	private static final Pattern DATE = Pattern.compile("^(\\d{4})(?:-(0[1-9]|1[0-2]))?(?:-(0[1-9]|[12]\\d|3[01]))?$");
	private static final Map<String, Set<String>> HEADINGS = Map.of(
			"EXPERIENCE", Set.of("experience", "work experience", "employment", "employment history", "professional experience"),
			"EDUCATION", Set.of("education", "academic background"), "SKILLS", Set.of("skills", "technical skills", "core skills"));

	private ResumeCheckScore() { }

	public static int score(ResumeDocument doc, int year) {
		var ignored = new java.util.HashSet<>(doc.ignoredChecks());
		int[] penalty = { 0 };
		java.util.function.BiConsumer<String, Integer> add = (id, weight) -> { if (!ignored.contains(id)) penalty[0] += weight; };
		var basics = doc.basics();
		var m = doc.metadata();
		if (basics.name().isBlank()) add.accept("contact-name", 20);
		if (basics.email().isBlank()) add.accept("contact-email", 20);
		else if (!EMAIL.matcher(basics.email().strip()).matches()) add.accept("contact-email-invalid", 20);
		if (basics.phone().isBlank()) add.accept("contact-phone", 10);
		if (basics.location().isBlank()) add.accept("contact-location", 10);
		if (!basics.website().isBlank()) {
			try {
				var url = URI.create(basics.website().strip());
				if (!("http".equalsIgnoreCase(url.getScheme()) || "https".equalsIgnoreCase(url.getScheme())) || url.getHost() == null) throw new IllegalArgumentException();
			}
			catch (IllegalArgumentException e) { add.accept("contact-url", 10); }
		}
		if (!basics.photo().assetId().isEmpty() && basics.photo().visible()) add.accept("contact-photo", 10);
		if (m.fontSize() < 9) add.accept("layout-font-size", 10);
		if (m.margin() < 24) add.accept("layout-margin", 10);
		if (m.template().equals("sidebar")) add.accept("layout-columns", 10);
		if (m.entryColumns() > 1) add.accept("layout-entry-columns", 10);
		if (doc.sections().stream().noneMatch(s -> !s.hidden() && s.kind() == ResumeDocument.Kind.EXPERIENCE && s.entries().stream().anyMatch(e -> !e.hidden()))) add.accept("heading-experience", 10);
		if (!richText(doc.summary())) add.accept("writing-summary", 10);
		for (var section : doc.sections()) {
			if (section.hidden()) continue;
			var kind = section.kind().name();
			var title = section.title().strip();
			if (title.isEmpty()) add.accept("heading-" + section.id(), 10);
			var standards = HEADINGS.get(kind);
			if (doc.locale().toLowerCase(Locale.ROOT).startsWith("en") && !title.isEmpty() && standards != null && !standards.contains(title.toLowerCase(Locale.ROOT))) add.accept("heading-nonstandard-" + section.id(), 10);
			var placed = m.placements().stream().filter(p -> p.section().equals(section.id())).findFirst();
			if (m.template().equals("sidebar") && Set.of("EXPERIENCE", "EDUCATION", "PROJECTS").contains(kind)
					&& section.entries().stream().anyMatch(e -> !e.hidden()) && placed.map(p -> p.column().equals("side")).orElse(false)) add.accept("layout-sidebar-" + section.id(), 10);
			for (var entry : section.entries()) {
				if (entry.hidden()) continue;
				if (kind.equals("EXPERIENCE") && stripped(entry.description()).isBlank() && entry.roles().stream().noneMatch(r -> !stripped(r.description()).isBlank())) add.accept("writing-" + entry.id(), 10);
				var start = entry.startDate(); var end = entry.endDate();
				if (Set.of("EXPERIENCE", "EDUCATION").contains(kind) && start.isBlank() && end.isBlank()) add.accept("dates-missing-" + entry.id(), 10);
				if (invalidDate(start) || invalidDate(end)) add.accept("dates-invalid-" + entry.id(), 10);
				if (DATE.matcher(start).matches() && Integer.parseInt(start.substring(0, 4)) > year) add.accept("dates-future-" + entry.id(), 10);
				if (DATE.matcher(start).matches() && DATE.matcher(end).matches() && earliest(start).compareTo(latest(end)) > 0) add.accept("dates-" + entry.id(), 20);
			}
		}
		return (int) Math.round(10000.0 / (100 + penalty[0]));
	}

	private static boolean richText(String html) {
		var root = Jsoup.parseBodyFragment(html).body();
		return root.children().stream().anyMatch(e -> (e.tagName().equals("p") && !e.text().isBlank())
				|| ((e.tagName().equals("ul") || e.tagName().equals("ol")) && e.children().stream().anyMatch(li -> li.tagName().equals("li") && !li.text().isBlank())));
	}
	private static String stripped(String html) { return html.replaceAll("<[^>]*>", "").trim(); }
	private static boolean invalidDate(String d) { return !d.isBlank() && !d.equalsIgnoreCase("present") && !DATE.matcher(d).matches(); }
	private static String earliest(String d) { return d.length() == 4 ? d + "-01-01" : d.length() == 7 ? d + "-01" : d; }
	private static String latest(String d) { return d.length() == 4 ? d + "-12-31" : d.length() == 7 ? d + "-31" : d; }
}
