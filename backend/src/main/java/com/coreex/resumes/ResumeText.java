package com.coreex.resumes;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.safety.Safelist;

import com.coreex.resumes.ResumeDocument.Entry;
import com.coreex.resumes.ResumeDocument.Role;
import com.coreex.resumes.ResumeDocument.Section;

/**
 * What the backend does with the HTML of a Resume (ADR 0011): sanitise it against the marks Tiptap makes, and turn the
 * document into plain text and Markdown for Search, Chat, Agents and Export.
 */
final class ResumeText {

	// The marks and blocks of the editor: bold, italic, underline, lists, links, colour and alignment.
	private static final Safelist ALLOWED = new Safelist().addTags("p", "br", "strong", "em", "u", "ul", "ol", "li", "a", "span")
			.addAttributes("a", "href").addAttributes("p", "style").addAttributes("span", "style")
			.addProtocols("a", "href", "http", "https", "mailto");

	// Colour and alignment are the only styles the editor makes, so they are the only ones kept.
	private static final Pattern STYLE = Pattern.compile(
			"(?i)\\s*(color:\\s*(#[0-9a-f]{3,8}|rgb\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*\\))|text-align:\\s*(left|center|right|justify))\\s*");

	private ResumeText() {
	}

	/** The HTML with only the allowed tags, attributes, link addresses and styles left. */
	static String clean(String html) {
		if (html == null || html.isBlank()) {
			return "";
		}
		// A NUL character is dropped: jsoup would write it as &#x0; and Postgres cannot store the text it turns back into.
		var body = Jsoup.parseBodyFragment(Jsoup.clean(html.replace("\0", ""), "", ALLOWED,
				new Document.OutputSettings().prettyPrint(false)));
		for (var element : body.select("[style]")) {
			var kept = new ArrayList<String>();
			for (var declaration : element.attr("style").split(";")) {
				if (STYLE.matcher(declaration).matches()) {
					kept.add(declaration.strip().replaceAll("(?i)^(color|text-align):\\s*", "$1: "));
				}
			}
			if (kept.isEmpty()) {
				element.removeAttr("style");
			}
			else {
				element.attr("style", String.join("; ", kept));
			}
		}
		body.outputSettings().prettyPrint(false);
		return body.body().html();
	}

	/** The document with every HTML field cleaned. */
	static ResumeDocument clean(ResumeDocument document) {
		var sections = new ArrayList<Section>();
		for (var section : document.sections()) {
			var entries = new ArrayList<Entry>();
			for (var e : section.entries()) {
				var roles = e.roles().stream().map(r -> new Role(r.id(), r.title(), r.startDate(), r.endDate(), clean(r.description()))).toList();
				entries.add(new Entry(e.id(), e.hidden(), e.title(), e.subtitle(), e.location(), e.startDate(), e.endDate(),
						e.url(), e.level(), clean(e.description()), e.keywords(), roles));
			}
			sections.add(new Section(section.id(), section.kind(), section.title(), section.hidden(), entries));
		}
		return new ResumeDocument(document.locale(), document.basics(), clean(document.summary()), sections,
				document.metadata(), document.privateNotes(), document.ignoredChecks());
	}

	/** Text with each block (paragraph, list item, line break) on its own line. */
	static String plain(String html) {
		var body = Jsoup.parseBodyFragment(html == null ? "" : html).body();
		body.select("br").after("\n");
		body.select("p, li").after("\n");
		return body.wholeText().strip().replaceAll("\n{2,}", "\n");
	}

	/** Markdown for bold, italic, links, paragraphs and lists; underline, colour and alignment have no Markdown. */
	static String markdown(String html) {
		var out = new StringBuilder();
		blocks(Jsoup.parseBodyFragment(html == null ? "" : html).body(), out);
		return out.toString().strip();
	}

	private static void blocks(Element parent, StringBuilder out) {
		for (var node : parent.childNodes()) {
			if (node instanceof Element e && (e.tagName().equals("ul") || e.tagName().equals("ol"))) {
				var number = 1;
				for (var item : e.children()) {
					out.append(e.tagName().equals("ul") ? "- " : number++ + ". ").append(inline(item).strip()).append('\n');
				}
				out.append('\n');
			}
			else if (node instanceof Element e && e.tagName().equals("p")) {
				out.append(inline(e).strip()).append("\n\n");
			}
			else if (node instanceof TextNode t && !t.isBlank()) {
				out.append(t.text().strip()).append("\n\n");
			}
		}
	}

	private static String inline(Node node) {
		var out = new StringBuilder();
		for (var child : node.childNodes()) {
			if (child instanceof TextNode t) {
				out.append(t.text());
			}
			else if (child instanceof Element e) {
				var inner = inline(e);
				switch (e.tagName()) {
					case "strong" -> out.append("**").append(inner).append("**");
					case "em" -> out.append('*').append(inner).append('*');
					case "a" -> out.append('[').append(inner).append("](").append(e.attr("href")).append(')');
					case "br" -> out.append('\n');
					default -> out.append(inner);
				}
			}
		}
		return out.toString();
	}

	/** The whole document as plain text. */
	static String plain(ResumeDocument document) {
		return render(document, false);
	}

	/** The whole document as Markdown: the name as the title, then each visible section. */
	static String markdown(ResumeDocument document) {
		return render(document, true);
	}

	private static String render(ResumeDocument document, boolean markdown) {
		var out = new ArrayList<String>();
		var b = document.basics();
		out.add(markdown && !b.name().isBlank() ? "# " + b.name() : b.name());
		var contact = new ArrayList<String>(List.of(b.headline(), b.email(), b.phone(), b.location(), b.website()));
		b.customFields().forEach(f -> contact.add(f.label().isBlank() ? f.value() : f.label() + ": " + f.value()));
		out.add(String.join(" | ", contact.stream().filter(s -> !s.isBlank()).toList()));
		out.add(text(document.summary(), markdown));
		for (var section : document.sections()) {
			if (section.hidden()) {
				continue;
			}
			out.add(markdown && !section.title().isBlank() ? "## " + section.title() : section.title());
			for (var e : section.entries()) {
				if (e.hidden()) {
					continue;
				}
				var dates = e.startDate().isBlank() ? e.endDate() : e.startDate() + (e.endDate().isBlank() ? "" : " - " + e.endDate());
				var head = String.join(" | ", List.of(e.title(), e.subtitle(), e.location(), dates, e.url()).stream()
						.filter(s -> !s.isBlank()).toList());
				out.add(markdown && !head.isBlank() ? "### " + head : head);
				out.add(e.level());
				out.add(text(e.description(), markdown));
				for (var r : e.roles()) {
					var span = r.startDate().isBlank() ? r.endDate() : r.startDate() + (r.endDate().isBlank() ? "" : " - " + r.endDate());
					out.add(String.join(" | ", List.of(r.title(), span).stream().filter(s -> !s.isBlank()).toList()));
					out.add(text(r.description(), markdown));
				}
				out.add(String.join(", ", e.keywords()));
			}
		}
		return String.join("\n\n", out.stream().filter(s -> !s.isBlank()).toList()).strip();
	}

	private static String text(String html, boolean markdown) {
		return markdown ? markdown(html) : plain(html);
	}

}
