import { ImportError, type Mapped, type ResumeDocument, isObject } from "./common";
import { coreExToResume } from "./coreex";
import { jsonResumeToResume } from "./json-resume";
import { linkedInToResume } from "./linkedin";
import { reactiveResumeToResume } from "./reactive-resume";

export { ImportError } from "./common";

// What the review step shows, and what Create saves.
export type Imported = {
  format: string;
  name: string;
  document: ResumeDocument;
  sections: { title: string; count: number }[];
  skipped: string[];
};

// Untrusted files: the sizes are capped before anything is parsed or unpacked.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_FILES = 100;
const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

// Reads a file the User chose and maps it. The format comes from what the file holds, never from its name. Throws an
// ImportError with the reason when the file cannot be read; nothing is created then.
export async function readImport(file: File): Promise<Imported> {
  if (file.size > MAX_FILE_BYTES) throw new ImportError("This file is bigger than 5 MB, so nothing was imported.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mapped = isZip(bytes) ? linkedInToResume(await unzipLinkedIn(bytes)) : fromJson(bytes);
  return summarise(mapped);
}

function fromJson(bytes: Uint8Array): Mapped {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ""));
  } catch {
    throw new ImportError("This file is not valid JSON, so nothing was imported.");
  }
  if (isObject(value) && Array.isArray(value.sections) && isObject(value.basics) && isObject(value.metadata)) {
    return coreExToResume(value);
  }
  if (isObject(value) && isObject(value.sections) && isObject(value.basics)) return reactiveResumeToResume(value);
  if (isObject(value) && isObject(value.basics) && ["work", "education", "skills", "projects"].some((k) => Array.isArray(value[k]))) {
    return jsonResumeToResume(value);
  }
  throw new ImportError("This file is not a CoreEx, Reactive Resume, JSON Resume or LinkedIn export, so nothing was imported.");
}

// The LinkedIn CSV files in a zip, by name. The zip's own sizes are checked before anything is unpacked, so a small zip
// that would unpack huge is refused.
// shortcut: only these ten CSVs are read from a LinkedIn zip, other files are ignored, upgrade when another one is needed.
const LINKEDIN = [
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

async function unzipLinkedIn(bytes: Uint8Array): Promise<Record<string, string>> {
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ImportError("This zip cannot be opened, so nothing was imported.");
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_ZIP_FILES) {
    throw new ImportError(`This zip holds more than ${MAX_ZIP_FILES} files, so nothing was imported.`);
  }
  // jszip keeps each entry's size from the zip's directory on the entry; a missing size counts as too big.
  const declared = entries.reduce(
    (sum, f) => sum + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? Infinity),
    0,
  );
  if (declared > MAX_UNZIPPED_BYTES) throw new ImportError("This zip would unpack to more than 20 MB, so nothing was imported.");

  const files: Record<string, string> = {};
  let unpacked = 0;
  for (const entry of entries) {
    const name = entry.name.split("/").pop() ?? "";
    if (!LINKEDIN.includes(name.toLowerCase())) continue;
    const data = await entry.async("uint8array");
    unpacked += data.length;
    if (unpacked > MAX_UNZIPPED_BYTES) throw new ImportError("This zip would unpack to more than 20 MB, so nothing was imported.");
    files[name] = new TextDecoder().decode(data);
  }
  return files;
}

function summarise({ format, document, skipped }: Mapped): Imported {
  return {
    format,
    name: document.basics.name || "Imported Resume",
    document,
    sections: document.sections.filter((s) => s.entries.length).map((s) => ({ title: s.title, count: s.entries.length })),
    skipped,
  };
}
