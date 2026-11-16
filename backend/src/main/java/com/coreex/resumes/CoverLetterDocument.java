package com.coreex.resumes;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jsoup.nodes.Entities;

import java.util.List;

/** One letter. Rich text is cleaned by the backend on every write. */
public record CoverLetterDocument(@NotNull @Size(max = 2000) String recipient, @NotNull @Size(max = 100) String date,
		@NotNull @Size(max = 1000) String greeting, @NotNull @Size(max = 200000) String body,
		@NotNull @Size(max = 1000) String signOff, @NotNull @Valid ResumeDocument.Basics sender,
		@NotNull @Valid ResumeDocument.Metadata design) {

	public CoverLetterDocument {
		recipient = recipient == null ? "" : recipient;
		date = date == null ? "" : date;
		greeting = greeting == null ? "" : greeting;
		body = body == null ? "" : body;
		signOff = signOff == null ? "" : signOff;
		var blank = ResumeDocument.blank();
		sender = sender == null ? blank.basics() : sender;
		design = design == null ? blank.metadata() : design;
	}

	CoverLetterDocument withSenderAndDesign(ResumeDocument.Basics from, ResumeDocument.Metadata style) {
		return new CoverLetterDocument(recipient, date, greeting, body, signOff, from, style);
	}

	CoverLetterDocument withBody(String newBody) {
		return new CoverLetterDocument(recipient, date, greeting, newBody, signOff, sender, design);
	}

	CoverLetterDocument clean() {
		return new CoverLetterDocument(recipient.replace("\0", ""), date.replace("\0", ""), greeting.replace("\0", ""),
				ResumeText.clean(body), signOff.replace("\0", ""), sender, design);
	}

	String plain() {
		return String.join("\n", recipient, date, greeting, ResumeText.plain(body), signOff).strip();
	}

	public String markdown() {
		var contact = java.util.stream.Stream.of(sender.email(), sender.phone(), sender.location(), sender.website())
				.filter(s -> !s.isBlank()).collect(java.util.stream.Collectors.joining(" | "));
		return java.util.stream.Stream.of(sender.name(), sender.headline(), contact, recipient, date, greeting, ResumeText.markdown(body), signOff)
				.filter(s -> !s.isBlank()).collect(java.util.stream.Collectors.joining("\n\n"));
	}

	private static String paragraph(String text) {
		return text.isBlank() ? "" : "<p>" + Entities.escape(text).replace("\n", "<br>") + "</p>";
	}

	/** The same content in the shared PDF renderer's input format. */
	public ResumeDocument asResume() {
		return new ResumeDocument("en", sender, paragraph(recipient) + paragraph(date) + paragraph(greeting) + body
				+ paragraph(signOff), List.of(), design, "", List.of());
	}
}
