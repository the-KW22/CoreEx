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
		basics = basics == null ? new Basics(null, null, null, null, null, null, null, null) : basics;
		summary = summary == null ? "" : summary;
		sections = sections == null ? List.of() : List.copyOf(sections);
		metadata = metadata == null ? new Metadata(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null) : metadata;
		privateNotes = privateNotes == null ? "" : privateNotes;
		ignoredChecks = ignoredChecks == null ? List.of() : List.copyOf(ignoredChecks);
	}

	/** The same Resume with no photo chosen (its frame settings stay). */
	public ResumeDocument withoutPhoto() {
		var b = basics;
		return new ResumeDocument(locale, new Basics(b.name(), b.headline(), b.email(), b.phone(), b.location(), b.website(),
				b.customFields(), b.photo().without()), summary, sections, metadata, privateNotes, ignoredChecks);
	}

	public static ResumeDocument blank() {
		return new ResumeDocument(null, null, null, null, null, null, null);
	}

	public record Basics(@NotNull String name, @NotNull String headline, @NotNull String email, @NotNull String phone,
			@NotNull String location, @NotNull String website, @NotNull List<Field> customFields, @NotNull Photo photo) {

		public Basics {
			name = name == null ? "" : name;
			headline = headline == null ? "" : headline;
			email = email == null ? "" : email;
			phone = phone == null ? "" : phone;
			location = location == null ? "" : location;
			website = website == null ? "" : website;
			customFields = customFields == null ? List.of() : List.copyOf(customFields);
			photo = photo == null ? new Photo(null, null, null, null, null, null, null) : photo;
		}

	}

	/**
	 * The photo on the page: the id of one of the User's image Assets (empty: none), whether it shows, its frame in points
	 * (circle, rounded or square) and the crop, where the picture is centred in the frame (0 to 100 each way) and how
	 * much it is zoomed (100 to 300 percent). That the Asset is the User's own image is checked when it is chosen
	 * (ResumeService); the values are brought into range here.
	 */
	public record Photo(@NotNull String assetId, @NotNull Boolean visible, @NotNull Integer size, @NotNull String shape,
			@NotNull Integer cropX, @NotNull Integer cropY, @NotNull Integer zoom) {

		public Photo {
			assetId = assetId != null && assetId.matches("[0-9a-fA-F-]{36}") ? assetId.toLowerCase() : "";
			visible = visible == null || visible;
			size = Metadata.within(size, 30, 160, 80);
			shape = Metadata.oneOf(shape, "circle", "circle", "rounded", "square");
			cropX = Metadata.within(cropX, 0, 100, 50);
			cropY = Metadata.within(cropY, 0, 100, 50);
			zoom = Metadata.within(zoom, 100, 300, 100);
		}

		public Photo without() {
			return new Photo("", visible, size, shape, cropX, cropY, zoom);
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

	/**
	 * One item of a section: a job, a school, a project, a skill group, a language. Dates are ISO text ("2021", "2021-03",
	 * "2021-03-15") and an end of "present" means still going; how they print is {@code Metadata.dateFormat}. A job can
	 * hold several {@code roles} at the same company. {@code level} is for languages and skills.
	 */
	public record Entry(@NotNull String id, @NotNull Boolean hidden, @NotNull String title, @NotNull String subtitle,
			@NotNull String location, @NotNull String startDate, @NotNull String endDate, @NotNull String url,
			@NotNull String level, @NotNull String description, @NotNull List<String> keywords, @NotNull List<Role> roles) {

		public Entry {
			id = id == null ? "" : id;
			hidden = hidden != null && hidden;
			title = title == null ? "" : title;
			subtitle = subtitle == null ? "" : subtitle;
			location = location == null ? "" : location;
			startDate = startDate == null ? "" : startDate;
			endDate = endDate == null ? "" : endDate;
			url = url == null ? "" : url;
			level = level == null ? "" : level;
			description = description == null ? "" : description;
			keywords = keywords == null ? List.of() : List.copyOf(keywords);
			roles = roles == null ? List.of() : List.copyOf(roles);
		}

		/** An entry with no level and no roles, as most are. */
		public Entry(String id, Boolean hidden, String title, String subtitle, String location, String startDate,
				String endDate, String url, String description, List<String> keywords) {
			this(id, hidden, title, subtitle, location, startDate, endDate, url, "", description, keywords, List.of());
		}

	}

	public record Role(@NotNull String id, @NotNull String title, @NotNull String startDate, @NotNull String endDate,
			@NotNull String description) {

		public Role {
			id = id == null ? "" : id;
			title = title == null ? "" : title;
			startDate = startDate == null ? "" : startDate;
			endDate = endDate == null ? "" : endDate;
			description = description == null ? "" : description;
		}

	}

	/**
	 * The look: template, accent colour, fonts (body and headings), text size in points, density, page size (A4, LETTER or
	 * FREE with its own width and height in points), how many pages it means to have, margin, how dates print (MMM_YYYY, MM_YYYY, YYYY_MM or YYYY), the
	 * sidebar's side and width, entries in one or two columns, the entry header and where sections go. A value the
	 * renderer cannot draw is brought back into range when it is saved, so an import or an Agent cannot break the page.
	 */
	public record Metadata(@NotNull String template, @NotNull String accent, @NotNull String font, @NotNull String headingFont,
			@NotNull Integer fontSize, @NotNull String density, @NotNull String pageSize, @NotNull Integer pageWidth,
			@NotNull Integer pageHeight, @NotNull Integer pageCount, @NotNull Integer margin, @NotNull String dateFormat, @NotNull String sidebarSide,
			@NotNull Integer sidebarWidth, @NotNull Integer entryColumns, @NotNull String entryHeader,
			@NotNull List<Placement> placements, @NotNull String customCss) {

		public Metadata {
			template = template == null || template.isBlank() ? "classic" : template;
			accent = accent == null || !accent.matches("#[0-9a-fA-F]{6}") ? "#1d4ed8" : accent;
			font = font == null || font.isBlank() ? "Inter" : font;
			headingFont = headingFont == null ? "" : headingFont;
			fontSize = within(fontSize, 6, 20, 10);
			density = oneOf(density, "comfortable", "compact", "comfortable", "relaxed");
			pageSize = oneOf(pageSize, "A4", "A4", "LETTER", "FREE");
			pageWidth = within(pageWidth, 200, 2000, 595);
			pageHeight = within(pageHeight, 200, 2000, 842);
			pageCount = within(pageCount, 1, 9, 1);
			margin = within(margin, 0, 120, 40);
			dateFormat = dateFormat == null || dateFormat.isBlank() ? "MMM_YYYY" : dateFormat;
			sidebarSide = oneOf(sidebarSide, "left", "left", "right");
			sidebarWidth = within(sidebarWidth, 80, 400, 170);
			entryColumns = entryColumns != null && entryColumns == 2 ? 2 : 1;
			entryHeader = oneOf(entryHeader, "inline", "inline", "stacked");
			placements = placements == null ? List.of() : List.copyOf(placements);
			// Not brought into range like the rest: a rule that cannot be drawn is refused when it is saved (ResumeService).
			customCss = customCss == null ? "" : customCss;
		}

		static int within(Integer value, int low, int high, int fallback) {
			return value == null || value == 0 && low > 0 && fallback != 0 ? fallback : Math.min(high, Math.max(low, value));
		}

		static String oneOf(String value, String fallback, String... allowed) {
			return value != null && java.util.Arrays.asList(allowed).contains(value) ? value : fallback;
		}

	}

	/** Where one section goes: "side" or "main" ("" is the template's own choice) and the page it is drawn on (1 to 9). */
	public record Placement(@NotNull String section, @NotNull String column, @NotNull Integer page) {

		public Placement {
			section = section == null ? "" : section;
			column = column != null && (column.equals("side") || column.equals("main")) ? column : "";
			page = page == null ? 1 : Math.min(9, Math.max(1, page));
		}

	}

}
