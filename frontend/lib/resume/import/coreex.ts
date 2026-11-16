import { DEFAULT_PHOTO } from "../design";

import {
  type Entry,
  ImportError,
  KINDS,
  type Kind,
  type Mapped,
  type Role,
  type Section,
  isObject,
  list,
  pickMetadata,
  raw,
  resumeDocument,
  text,
} from "./common";

// A CoreEx JSON file is what Export writes: a Resume's ResumeDocument. Its HTML is kept as it is; the backend sanitises
// it when the Resume is created, exactly as it does for any save.
export function coreExToResume(value: unknown): Mapped {
  if (!isObject(value) || !Array.isArray(value.sections) || !isObject(value.basics)) {
    throw new ImportError("This is not a CoreEx Resume: it needs basics and a list of sections, so nothing was imported.");
  }
  const skipped: string[] = [];
  const basics = value.basics;
  // A photo is one of the exporting account's own Assets, so it is left out rather than refused on create.
  // shortcut: photos are never imported, the file names an Asset of another account, upgrade by uploading the picture as this User's Asset when asked.
  if (isObject(basics.photo) && text(basics.photo.assetId)) {
    skipped.push("Photo: its Asset belongs to the account that exported it, so it is not imported.");
  }
  return {
    format: "CoreEx JSON",
    skipped,
    document: resumeDocument(
      {
        name: text(basics.name),
        headline: text(basics.headline),
        email: text(basics.email),
        phone: text(basics.phone),
        location: text(basics.location),
        website: text(basics.website),
        customFields: list(basics.customFields).filter(isObject).map((f) => ({ label: text(f.label), value: text(f.value) })),
        photo: { ...DEFAULT_PHOTO },
      },
      raw(value.summary),
      value.sections.map(section),
      pickMetadata(value.metadata),
    ),
  };
}

function section(value: unknown, index: number): Section {
  if (!isObject(value) || typeof value.kind !== "string" || !KINDS.includes(value.kind as Kind)) {
    throw new ImportError(`Section ${index + 1} has an unknown kind, so nothing was imported.`);
  }
  if (!Array.isArray(value.entries)) {
    throw new ImportError(`Section ${index + 1} has no list of entries, so nothing was imported.`);
  }
  const kind = value.kind as Kind;
  const id = text(value.id) || kind.toLowerCase();
  return {
    id,
    kind,
    title: text(value.title),
    hidden: value.hidden === true,
    entries: value.entries.map((e, n) => entryOf(e, id, n)),
  };
}

function entryOf(value: unknown, sectionId: string, index: number): Entry {
  if (!isObject(value)) throw new ImportError(`An entry in ${sectionId} is not an object, so nothing was imported.`);
  return {
    id: text(value.id) || `${sectionId}-${index + 1}`,
    hidden: value.hidden === true,
    title: text(value.title),
    subtitle: text(value.subtitle),
    location: text(value.location),
    startDate: text(value.startDate),
    endDate: text(value.endDate),
    url: text(value.url),
    level: text(value.level),
    description: raw(value.description),
    keywords: list(value.keywords).map(text).filter(Boolean),
    roles: list(value.roles).filter(isObject).map(
      (r): Role => ({
        id: text(r.id),
        title: text(r.title),
        startDate: text(r.startDate),
        endDate: text(r.endDate),
        description: raw(r.description),
      }),
    ),
  };
}
