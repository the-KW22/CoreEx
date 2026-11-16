import {
  type Dict,
  ImportError,
  type Mapped,
  type Section,
  bullets,
  emptyBasics,
  entry,
  isObject,
  list,
  parseDate,
  paragraphs,
  resumeDocument,
  sectionOf,
  text,
} from "./common";

// JSON Resume (jsonresume.org): plain text throughout, so every text field is escaped into paragraphs.
// A work entry with no end date is still going, as JSON Resume means it.

// A list at the top level that must be a list when it is there at all.
function arrayAt(value: Dict, key: string): Dict[] {
  const v = value[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every(isObject)) {
    throw new ImportError(`The JSON Resume "${key}" is not a list of objects, so nothing was imported.`);
  }
  return v;
}

const highlights = (item: Dict): string => bullets(list(item.highlights).map(text).filter(Boolean));

const body = (item: Dict, summaryKey: string): string => paragraphs(text(item[summaryKey])) + highlights(item);

export function jsonResumeToResume(value: unknown): Mapped {
  if (!isObject(value) || !isObject(value.basics)) {
    throw new ImportError("This is not a JSON Resume file: it needs a basics object, so nothing was imported.");
  }
  const b = value.basics;
  const work = arrayAt(value, "work");
  const volunteer = arrayAt(value, "volunteer");
  const education = arrayAt(value, "education");
  const awards = arrayAt(value, "awards");
  const certificates = arrayAt(value, "certificates");
  const publications = arrayAt(value, "publications");
  const skills = arrayAt(value, "skills");
  const languages = arrayAt(value, "languages");
  const interests = arrayAt(value, "interests");
  const references = arrayAt(value, "references");
  const projects = arrayAt(value, "projects");

  const location = isObject(b.location) ? [text(b.location.city), text(b.location.region)].filter(Boolean).join(", ") : "";
  const profiles = arrayAt(b, "profiles");

  const sections: Section[] = [
    ...sectionOf("PROFILES", profiles.map((p, n) => entry("profiles", n, { title: text(p.network), subtitle: text(p.username), url: text(p.url) }))),
    ...sectionOf(
      "EXPERIENCE",
      work.map((w, n) =>
        entry("experience", n, {
          title: text(w.position),
          subtitle: text(w.name),
          startDate: parseDate(text(w.startDate)),
          endDate: text(w.endDate) ? parseDate(text(w.endDate)) : "present",
          url: text(w.url),
          description: body(w, "summary"),
        }),
      ),
    ),
    ...sectionOf(
      "VOLUNTEERING",
      volunteer.map((v, n) =>
        entry("volunteering", n, {
          title: text(v.organization),
          subtitle: text(v.position),
          startDate: parseDate(text(v.startDate)),
          endDate: parseDate(text(v.endDate)),
          url: text(v.url),
          description: body(v, "summary"),
        }),
      ),
    ),
    ...sectionOf(
      "EDUCATION",
      education.map((e, n) =>
        entry("education", n, {
          title: [text(e.studyType), text(e.area)].filter(Boolean).join(" "),
          subtitle: text(e.institution),
          startDate: parseDate(text(e.startDate)),
          endDate: parseDate(text(e.endDate)),
          url: text(e.url),
          description: paragraphs(text(e.score) ? `Score: ${text(e.score)}` : ""),
        }),
      ),
    ),
    ...sectionOf(
      "AWARDS",
      awards.map((a, n) =>
        entry("awards", n, { title: text(a.title), subtitle: text(a.awarder), startDate: parseDate(text(a.date)), description: paragraphs(text(a.summary)) }),
      ),
    ),
    ...sectionOf(
      "CERTIFICATIONS",
      certificates.map((c, n) =>
        entry("certifications", n, { title: text(c.name), subtitle: text(c.issuer), startDate: parseDate(text(c.date)), url: text(c.url) }),
      ),
    ),
    ...sectionOf(
      "PUBLICATIONS",
      publications.map((p, n) =>
        entry("publications", n, {
          title: text(p.name),
          subtitle: text(p.publisher),
          startDate: parseDate(text(p.releaseDate)),
          url: text(p.url),
          description: paragraphs(text(p.summary)),
        }),
      ),
    ),
    ...sectionOf(
      "SKILLS",
      skills.map((s, n) => entry("skills", n, { title: text(s.name), level: text(s.level), keywords: list(s.keywords).map(text).filter(Boolean) })),
    ),
    ...sectionOf("LANGUAGES", languages.map((l, n) => entry("languages", n, { title: text(l.language), level: text(l.fluency) }))),
    ...sectionOf(
      "INTERESTS",
      interests.map((i, n) => entry("interests", n, { title: text(i.name), keywords: list(i.keywords).map(text).filter(Boolean) })),
    ),
    ...sectionOf(
      "REFERENCES",
      references.map((r, n) => entry("references", n, { title: text(r.name), description: paragraphs(text(r.reference)) })),
    ),
    ...sectionOf(
      "PROJECTS",
      projects.map((p, n) =>
        entry("projects", n, {
          title: text(p.name),
          startDate: parseDate(text(p.startDate)),
          endDate: parseDate(text(p.endDate)),
          url: text(p.url),
          description: body(p, "description"),
          keywords: list(p.keywords).map(text).filter(Boolean),
        }),
      ),
    ),
  ];

  return {
    format: "JSON Resume",
    skipped: [],
    document: resumeDocument(
      {
        ...emptyBasics({
          name: text(b.name),
          headline: text(b.label),
          email: text(b.email),
          phone: text(b.phone),
          location,
          website: text(b.url),
        }),
      },
      paragraphs(text(b.summary)),
      sections,
    ),
  };
}
