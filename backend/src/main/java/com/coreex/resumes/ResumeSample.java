package com.coreex.resumes;

import java.util.List;

import com.coreex.resumes.ResumeDocument.Basics;
import com.coreex.resumes.ResumeDocument.Entry;
import com.coreex.resumes.ResumeDocument.Kind;
import com.coreex.resumes.ResumeDocument.Section;

/** The Resume "New Resume with sample content" starts from: a made-up person, so every kind of section shows something. */
final class ResumeSample {

	private ResumeSample() {
	}

	static ResumeDocument document() {
		var experience = new Section("experience", Kind.EXPERIENCE, "Experience", false, List.of(
				new Entry("exp-1", false, "Senior Software Engineer", "Northwind Labs", "Remote", "2021-03", "Present", "",
						"<ul><li><p>Led a team of five that cut page load time by 40%.</p></li><li><p>Moved the billing system to a queue-based design.</p></li></ul>",
						List.of("Java", "PostgreSQL")),
				new Entry("exp-2", false, "Software Engineer", "Contoso", "Berlin, Germany", "2018-06", "2021-02", "",
						"<p>Built and ran the <strong>customer API</strong> used by 2,000 companies.</p>", List.of())));
		var education = new Section("education", Kind.EDUCATION, "Education", false, List.of(
				new Entry("edu-1", false, "BSc Computer Science", "University of Example", "", "2014-09", "2018-06", "",
						"", List.of())));
		var skills = new Section("skills", Kind.SKILLS, "Skills", false, List.of(
				new Entry("skill-1", false, "Backend", "", "", "", "", "", "", List.of("Java", "Spring Boot", "SQL")),
				new Entry("skill-2", false, "Frontend", "", "", "", "", "", "", List.of("TypeScript", "React"))));
		return new ResumeDocument("en",
				new Basics("Alex Morgan", "Senior Software Engineer", "alex.morgan@example.com", "+1 555 0100",
						"Austin, TX", "https://alexmorgan.example", List.of(), null),
				"<p>Engineer with <strong>seven years</strong> of experience building reliable web services and the teams that run them.</p>",
				List.of(experience, education, skills), null, "", List.of());
	}

}
