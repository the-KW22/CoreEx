import type { components } from "@/lib/api/schema";

import { DEFAULT_DESIGN, DEFAULT_PHOTO } from "../design";

export type ResumeDocument = components["schemas"]["ResumeDocument"];
export type Section = components["schemas"]["Section"];
export type Entry = components["schemas"]["Entry"];
export type Role = components["schemas"]["Role"];
export type Metadata = components["schemas"]["Metadata"];
export type Kind = Section["kind"];

export type Dict = Record<string, unknown>;

// What a mapper returns: the document it read, and the parts of the file it could not bring over.
export type Mapped = { format: string; document: ResumeDocument; skipped: string[] };

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export const KINDS: readonly Kind[] = [
  "EXPERIENCE",
  "EDUCATION",
  "PROJECTS",
  "SKILLS",
  "LANGUAGES",
  "CERTIFICATIONS",
  "AWARDS",
  "PUBLICATIONS",
  "VOLUNTEERING",
  "INTERESTS",
  "REFERENCES",
  "PROFILES",
  "CUSTOM",
];

export const TITLES: Record<Kind, string> = {
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  PROJECTS: "Projects",
  SKILLS: "Skills",
  LANGUAGES: "Languages",
  CERTIFICATIONS: "Certifications",
  AWARDS: "Awards",
  PUBLICATIONS: "Publications",
  VOLUNTEERING: "Volunteering",
  INTERESTS: "Interests",
  REFERENCES: "References",
  PROFILES: "Profiles",
  CUSTOM: "Custom",
};

export const isObject = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// A plain-text field: trimmed; a number is written out; anything else is empty.
export const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

// An HTML field, kept as it is (the backend sanitises it on create) and empty when it is not text.
export const raw = (v: unknown): string => (typeof v === "string" ? v : "");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Plain text as HTML: each blank-line-separated block is a paragraph, a line break stays a break, and every character is escaped.
export function paragraphs(plain: string): string {
  return plain
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map((line) => escapeHtml(line.trimEnd())).join("<br>")}</p>`)
    .join("");
}

export const bullets = (items: string[]): string =>
  items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// A date as Resume dates are stored: "2021", "2021-03" or "2021-03-15". "Mar 2021" becomes "2021-03", a present-tense
// word becomes "present", and anything else is kept as typed so nothing the file said is lost.
export function parseDate(value: string): string {
  const t = value.trim();
  if (!t) return "";
  if (/^(present|current|now|today|ongoing)$/i.test(t)) return "present";
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t)) return t;
  const named = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(t);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    if (month >= 0) return `${named[2]}-${String(month + 1).padStart(2, "0")}`;
  }
  return t;
}

// A period such as "Mar 2021 - Present" as a start and an end.
export function parsePeriod(period: string): { startDate: string; endDate: string } {
  const [start = "", end = ""] = period.split(/\s+(?:-|–|—|to)\s+/i);
  return { startDate: parseDate(start), endDate: parseDate(end) };
}

export const defaultMetadata = (): Metadata => ({ ...DEFAULT_DESIGN, template: "classic", dateFormat: "MMM_YYYY", customCss: "" });

// The file's look, where each setting has the type the Resume expects; anything else keeps the default.
export function pickMetadata(source: unknown): Metadata {
  const base: Dict = { ...defaultMetadata() };
  if (isObject(source)) {
    for (const key of Object.keys(base)) {
      const value = source[key];
      if (Array.isArray(base[key]) ? Array.isArray(value) : typeof value === typeof base[key]) base[key] = value;
    }
  }
  return base as Metadata;
}

export type Basics = components["schemas"]["Basics"];

// The basics of a new Resume: no photo, and every text field empty unless the mapper sets it.
export const emptyBasics = (fields: Partial<Basics>): Basics => ({
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  website: "",
  customFields: [],
  photo: { ...DEFAULT_PHOTO },
  ...fields,
});

// One entry, with every field the backend expects; the mapper sets the ones it reads.
export function entry(sectionId: string, index: number, fields: Partial<Entry>): Entry {
  return {
    id: `${sectionId}-${index + 1}`,
    hidden: false,
    title: "",
    subtitle: "",
    location: "",
    startDate: "",
    endDate: "",
    url: "",
    level: "",
    description: "",
    keywords: [],
    roles: [],
    ...fields,
  };
}

// A section of one kind. A section with no entries is left out, so the Resume has no empty headings.
// Returned as a list of zero or one section, so a mapper can spread it into its sections.
export function sectionOf(kind: Kind, entries: Entry[]): Section[] {
  return entries.length ? [{ id: kind.toLowerCase(), kind, title: TITLES[kind], hidden: false, entries }] : [];
}

export function resumeDocument(basics: Basics, summary: string, sections: Section[], metadata?: Metadata): ResumeDocument {
  return {
    locale: "en",
    basics,
    summary,
    sections,
    metadata: metadata ?? defaultMetadata(),
    privateNotes: "",
    ignoredChecks: [],
  };
}
