import {
  type Dict,
  type Entry,
  ImportError,
  type Kind,
  type Mapped,
  type Role,
  type Section,
  emptyBasics,
  entry,
  isObject,
  list,
  parseDate,
  parsePeriod,
  raw,
  resumeDocument,
  sectionOf,
  text,
} from "./common";

// Reactive Resume's JSON: basics and summary, then a section per kind of item. Each item has its dates as a structured
// "dates" object, or only as text in "period" (or "date" for single dates); both are read.
// shortcut: the field names of the current Reactive Resume schema only; an older export is read by the same names and
// may lose a field, upgrade with a fixture per old version when one is needed.

const website = (v: unknown): string => (isObject(v) ? text(v.url) : text(v));

// The dates of a range: start and end, with end "present" while it is still going.
function range(item: Dict): { startDate: string; endDate: string } {
  if (isObject(item.dates)) {
    const d = item.dates;
    return { startDate: text(d.start), endDate: d.present === true ? "present" : text(d.end) };
  }
  return parsePeriod(text(item.period));
}

// The date of a single-date item (an award, a certification, a publication).
const single = (item: Dict): string => (isObject(item.dates) ? text(item.dates.start) : parseDate(text(item.date)));

const keywords = (v: unknown): string[] => list(v).map(text).filter(Boolean);

function items(sections: Dict, key: string): Dict[] {
  const s = sections[key];
  if (s === undefined) return [];
  if (!isObject(s) || !Array.isArray(s.items)) {
    throw new ImportError(`The Reactive Resume section "${key}" is not a list of items, so nothing was imported.`);
  }
  return s.items.map((i) => {
    if (!isObject(i)) throw new ImportError(`An item in the Reactive Resume section "${key}" is not an object, so nothing was imported.`);
    return i;
  });
}

const roles = (item: Dict): Role[] =>
  list(item.roles)
    .filter(isObject)
    .map((r) => ({ id: text(r.id), title: text(r.position || r.title), ...range(r), description: raw(r.description) }));

// Each item section, in the order the Resume shows them: its kind, and how one item maps onto an entry.
const SECTIONS: { key: string; kind: Kind; map: (item: Dict, sectionId: string, n: number) => Entry }[] = [
  {
    key: "experience",
    kind: "EXPERIENCE",
    map: (i, s, n) =>
      entry(s, n, {
        title: text(i.position),
        subtitle: text(i.company),
        location: text(i.location),
        ...range(i),
        url: website(i.website),
        description: raw(i.description),
        hidden: i.hidden === true,
        roles: roles(i),
      }),
  },
  {
    key: "education",
    kind: "EDUCATION",
    map: (i, s, n) =>
      entry(s, n, {
        title: [text(i.degree), text(i.area)].filter(Boolean).join(" "),
        subtitle: text(i.school),
        location: text(i.location),
        ...range(i),
        url: website(i.website),
        description: raw(i.description),
        hidden: i.hidden === true,
      }),
  },
  {
    key: "projects",
    kind: "PROJECTS",
    map: (i, s, n) =>
      entry(s, n, { title: text(i.name), ...range(i), url: website(i.website), description: raw(i.description), hidden: i.hidden === true }),
  },
  {
    key: "skills",
    kind: "SKILLS",
    map: (i, s, n) =>
      entry(s, n, {
        title: text(i.name),
        level: text(i.proficiency),
        keywords: keywords(i.keywords),
        description: raw(i.description),
        hidden: i.hidden === true,
      }),
  },
  {
    key: "languages",
    kind: "LANGUAGES",
    map: (i, s, n) => entry(s, n, { title: text(i.language), level: text(i.fluency), hidden: i.hidden === true }),
  },
  {
    key: "interests",
    kind: "INTERESTS",
    map: (i, s, n) => entry(s, n, { title: text(i.name), keywords: keywords(i.keywords), hidden: i.hidden === true }),
  },
  {
    key: "awards",
    kind: "AWARDS",
    map: (i, s, n) =>
      entry(s, n, {
        title: text(i.title),
        subtitle: text(i.awarder),
        startDate: single(i),
        url: website(i.website),
        description: raw(i.description),
        hidden: i.hidden === true,
      }),
  },
  {
    key: "certifications",
    kind: "CERTIFICATIONS",
    map: (i, s, n) =>
      entry(s, n, {
        title: text(i.title),
        subtitle: text(i.issuer),
        startDate: single(i),
        url: website(i.website),
        description: raw(i.description),
        hidden: i.hidden === true,
      }),
  },
  {
    key: "publications",
    kind: "PUBLICATIONS",
    map: (i, s, n) =>
      entry(s, n, {
        title: text(i.title),
        subtitle: text(i.publisher),
        startDate: single(i),
        url: website(i.website),
        description: raw(i.description),
        hidden: i.hidden === true,
      }),
  },
  {
    key: "volunteer",
    kind: "VOLUNTEERING",
    map: (i, s, n) =>
      entry(s, n, {
        title: text(i.organization),
        location: text(i.location),
        ...range(i),
        url: website(i.website),
        description: raw(i.description),
        hidden: i.hidden === true,
      }),
  },
  {
    key: "references",
    kind: "REFERENCES",
    map: (i, s, n) =>
      entry(s, n, {
        title: text(i.name),
        subtitle: text(i.position),
        url: website(i.website),
        description: raw(i.description),
        hidden: i.hidden === true,
      }),
  },
  {
    key: "profiles",
    kind: "PROFILES",
    map: (i, s, n) => entry(s, n, { title: text(i.network), subtitle: text(i.username), url: website(i.website), hidden: i.hidden === true }),
  },
];

export function reactiveResumeToResume(value: unknown): Mapped {
  if (!isObject(value) || !isObject(value.basics) || !isObject(value.sections)) {
    throw new ImportError("This is not a Reactive Resume file: it needs basics and sections, so nothing was imported.");
  }
  const b = value.basics;
  const sections = value.sections;
  const skipped: string[] = [];

  // shortcut: a picture is never imported (its URL is not an Asset of this User), upgrade by uploading it as an Asset when asked.
  if (isObject(value.picture) && text(value.picture.url)) {
    skipped.push("Picture: not imported, choose a photo from your Assets instead.");
  }
  for (const custom of list(value.customSections).filter(isObject)) {
    skipped.push(`Custom section "${text(custom.name)}" (not imported).`);
  }
  const known = new Set(SECTIONS.map((s) => s.key));
  for (const key of Object.keys(sections)) {
    if (!known.has(key)) skipped.push(`Section "${key}" (not imported).`);
  }

  const made: Section[] = SECTIONS.flatMap(({ key, kind, map }) =>
    sectionOf(
      kind,
      items(sections, key).map((item, n) => map(item, key, n)),
    ),
  );

  const basics = emptyBasics({
    name: text(b.name),
    headline: text(b.headline),
    email: text(b.email),
    phone: text(b.phone),
    location: text(b.location),
    website: website(b.website),
    customFields: list(b.customFields)
      .filter(isObject)
      .map((f) => ({ label: text(f.name), value: text(f.value) }))
      .filter((f) => f.label || f.value),
  });

  return {
    format: "Reactive Resume JSON",
    skipped,
    // The summary is HTML already: it is kept as it is, and the backend sanitises it on create.
    document: resumeDocument(basics, isObject(value.summary) ? raw(value.summary.content) : "", made),
  };
}
