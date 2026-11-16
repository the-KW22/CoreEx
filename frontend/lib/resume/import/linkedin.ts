import { ImportError, type Mapped, type Section, emptyBasics, entry, paragraphs, parseDate, resumeDocument, sectionOf } from "./common";

// One row of a LinkedIn CSV: its cells by the header's name.
type Row = Record<string, string>;

// The CSV files of a LinkedIn data export that this reads. Any other file in the zip is ignored.
const KNOWN = [
  "profile.csv",
  "email addresses.csv",
  "positions.csv",
  "education.csv",
  "skills.csv",
  "languages.csv",
  "projects.csv",
  "certifications.csv",
  "honors.csv",
  "volunteering.csv",
];

// Rows of cells. A quoted cell may hold commas, quotes ("" for one) and line breaks; an unclosed quote is an error.
export function parseCsv(input: string): string[][] {
  const s = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (s[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("unclosed quote");
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// The rows of one file as objects keyed by the header; a blank row is left out.
function records(csv: string): Row[] {
  const [header = [], ...rows] = parseCsv(csv);
  const names = header.map((h) => h.trim());
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(names.map((name, i) => [name, (r[i] ?? "").trim()])));
}

// A LinkedIn date is "Mar 2021" or "2021". An empty end (Finished On) means the position or course is still going.
const span = (start: string, end: string) => ({ startDate: parseDate(start), endDate: end ? parseDate(end) : "present" });

export function linkedInToResume(files: Record<string, string>): Mapped {
  const byName = new Map(Object.entries(files).map(([name, csv]) => [name.toLowerCase(), csv]));
  if (!KNOWN.some((name) => byName.has(name))) {
    throw new ImportError("This is not a LinkedIn export: it has no Profile.csv or Positions.csv, so nothing was imported.");
  }
  const read = (name: string): Row[] => {
    const csv = byName.get(name);
    if (csv === undefined) return [];
    try {
      return records(csv);
    } catch {
      throw new ImportError(`${name} is not a valid CSV file, so nothing was imported.`);
    }
  };

  const profile: Row = read("profile.csv")[0] ?? {};
  const email: Row = read("email addresses.csv")[0] ?? {};
  const sections: Section[] = [
    ...sectionOf("EXPERIENCE", read("positions.csv").map((p, n) => entry("experience", n, {
      title: p["Title"] ?? "",
      subtitle: p["Company Name"] ?? "",
      location: p["Location"] ?? "",
      ...span(p["Started On"] ?? "", p["Finished On"] ?? ""),
      description: paragraphs(p["Description"] ?? ""),
    }))),
    ...sectionOf("EDUCATION", read("education.csv").map((e, n) => entry("education", n, {
      title: e["Degree Name"] ?? "",
      subtitle: e["School Name"] ?? "",
      startDate: parseDate(e["Start Date"] ?? ""),
      endDate: parseDate(e["End Date"] ?? ""),
      description: paragraphs(e["Notes"] ?? ""),
    }))),
    ...sectionOf("PROJECTS", read("projects.csv").map((p, n) => entry("projects", n, {
      title: p["Title"] ?? "",
      url: p["Url"] ?? "",
      ...span(p["Started On"] ?? "", p["Finished On"] ?? ""),
      description: paragraphs(p["Description"] ?? ""),
    }))),
    ...sectionOf("SKILLS", read("skills.csv").map((s, n) => entry("skills", n, { title: s["Name"] ?? "" }))),
    ...sectionOf("LANGUAGES", read("languages.csv").map((l, n) => entry("languages", n, { title: l["Name"] ?? "", level: l["Proficiency"] ?? "" }))),
    ...sectionOf("CERTIFICATIONS", read("certifications.csv").map((c, n) => entry("certifications", n, {
      title: c["Name"] ?? "",
      subtitle: c["Authority"] ?? "",
      startDate: parseDate(c["Started On"] ?? ""),
      endDate: parseDate(c["Finished On"] ?? ""),
      url: c["Url"] ?? "",
    }))),
    ...sectionOf("AWARDS", read("honors.csv").map((h, n) => entry("awards", n, {
      title: h["Title"] ?? "",
      startDate: parseDate(h["Issued On"] ?? ""),
      description: paragraphs(h["Description"] ?? ""),
    }))),
    ...sectionOf("VOLUNTEERING", read("volunteering.csv").map((v, n) => entry("volunteering", n, {
      title: v["Role"] ?? "",
      subtitle: v["Organization"] ?? "",
      ...span(v["Started On"] ?? "", v["Finished On"] ?? ""),
      description: paragraphs(v["Description"] ?? ""),
    }))),
  ];

  return {
    format: "LinkedIn export",
    skipped: [],
    document: resumeDocument(
      emptyBasics({
        name: [profile["First Name"], profile["Last Name"]].filter(Boolean).join(" "),
        headline: profile["Headline"] ?? "",
        email: email["Email Address"] ?? "",
        location: profile["Geo Location"] ?? "",
      }),
      paragraphs(profile["Summary"] ?? ""),
      sections,
    ),
  };
}
