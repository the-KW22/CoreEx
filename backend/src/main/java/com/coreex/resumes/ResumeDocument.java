package com.coreex.resumes;

import java.util.List;

import jakarta.validation.constraints.NotNull;

/**
 * A Resume's whole content, stored as one JSON document (ADR 0011). The summary and every entry description are HTML
 * from Tiptap, sanitised on every write; everything else is plain text. A missing field becomes "" or an empty list,
 * so a client or an Agent can send only what it has, and the {@code @NotNull}s tell OpenAPI the fields always come back.
 */
public record ResumeDocument(@NotNull String locale, @NotNull Basics basics, @NotNull String summary,
		@NotNull List<Section> sections, @NotNull Metadata metadata, @NotNull String privateNotes,
		@NotNull List<String> ignoredChecks) {

	public ResumeDocument {
		locale = locale == null || locale.isBlank() ? "en" : locale;
		basics = basics == null ? new Basics(null, null, null, null, null, null, null) : basics;
		summary = summary == null ? "" : summary;
		sections = sections == null ? List.of() : List.copyOf(sections);
		metadata = metadata == null ? new Metadata(null, null, null, null, null) : metadata;
		privateNotes = privateNotes == null ? "" : privateNotes;
		ignoredChecks = ignoredChecks == null ? List.of() : List.copyOf(ignoredChecks);
	}

	public static ResumeDocument blank() {
		return new ResumeDocument(null, null, null, null, null, null, null);
	}

	public record Basics(@NotNull String name, @NotNull String headline, @NotNull String email, @NotNull String phone,
			@NotNull String location, @NotNull String website, @NotNull List<Field> customFields) {

		public Basics {
			name = name == null ? "" : name;
			headline = headline == null ? "" : headline;
			email = email == null ? "" : email;
			phone = phone == null ? "" : phone;
			location = location == null ? "" : location;
			website = website == null ? "" : website;
			customFields = customFields == null ? List.of() : List.copyOf(customFields);
		}

	}

	public record Field(@NotNull String label, @NotNull String value) {

		public Field {
			label = label == null ? "" : label;
			value = value == null ? "" : value;
		}

	}

	public enum Kind {
		EXPERIENCE, EDUCATION, PROJECTS, SKILLS, LANGUAGES, CERTIFICATIONS, AWARDS, PUBLICATIONS, VOLUNTEERING,
		INTERESTS, REFERENCES, PROFILES, CUSTOM
	}

	public record Section(@NotNull String id, @NotNull Kind kind, @NotNull String title, @NotNull Boolean hidden,
			@NotNull List<Entry> entries) {

		public Section {
			id = id == null ? "" : id;
			kind = kind == null ? Kind.CUSTOM : kind;
			title = title == null ? "" : title;
			hidden = hidden != null && hidden;
			entries = entries == null ? List.of() : List.copyOf(entries);
		}

	}

	// shortcut: dates are plain text ("2021-03", "Present"), upgrade to structured dates with the sections ticket (#246).
	public record Entry(@NotNull String id, @NotNull Boolean hidden, @NotNull String title, @NotNull String subtitle,
			@NotNull String location, @NotNull String startDate, @NotNull String endDate, @NotNull String url,
			@NotNull String description, @NotNull List<String> keywords) {

		public Entry {
			id = id == null ? "" : id;
			hidden = hidden != null && hidden;
			title = title == null ? "" : title;
			subtitle = subtitle == null ? "" : subtitle;
			location = location == null ? "" : location;
			startDate = startDate == null ? "" : startDate;
			endDate = endDate == null ? "" : endDate;
			url = url == null ? "" : url;
			description = description == null ? "" : description;
			keywords = keywords == null ? List.of() : List.copyOf(keywords);
		}

	}

	/** The look: template, accent colour, font, text size in points and page size. Design controls extend it later. */
	public record Metadata(@NotNull String template, @NotNull String accent, @NotNull String font, @NotNull Integer fontSize,
			@NotNull String pageSize) {

		public Metadata {
			template = template == null || template.isBlank() ? "classic" : template;
			accent = accent == null || accent.isBlank() ? "#1d4ed8" : accent;
			font = font == null || font.isBlank() ? "Inter" : font;
			fontSize = fontSize == null || fontSize <= 0 ? 10 : fontSize;
			pageSize = pageSize == null || pageSize.isBlank() ? "A4" : pageSize;
		}

	}

}
