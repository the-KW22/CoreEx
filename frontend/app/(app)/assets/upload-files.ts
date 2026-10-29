import { importNotes } from "../notes/actions";
import { finishUpload, startUpload } from "./actions";

export type Outcome = { name: string; state: "uploading" | "done" | "failed"; message?: string; href?: string; label?: string };

// Markdown and text files become Notes; everything else is an Asset (the API refuses what it does not allow).
const isText = (file: File) => /\.(md|txt)$/i.test(file.name);
const IMPORT_MAX_BYTES = 1_000_000;
// One import call carries at most this many files and bytes: a server action's body is limited (4 MB), and the API
// takes 20 files at a time. Files in one call are imported together, so Links between them resolve.
const IMPORT_BATCH_FILES = 20;
const IMPORT_BATCH_BYTES = 3_000_000;

function batches(files: { file: File; index: number }[]) {
  const out: { file: File; index: number }[][] = [];
  let bytes = 0;
  for (const entry of files) {
    const last = out[out.length - 1];
    if (!last || last.length >= IMPORT_BATCH_FILES || bytes + entry.file.size > IMPORT_BATCH_BYTES) {
      out.push([entry]);
      bytes = 0;
    } else {
      last.push(entry);
    }
    bytes += entry.file.size;
  }
  return out;
}

// What the file picker offers: the types the API accepts.
export const ACCEPT_FILES = ".md,.txt,image/png,image/jpeg,image/webp,image/gif,application/pdf";

// A .md or .txt file is imported as a Note. Any other file is kept as an Asset: ask the API (type, size, quota), PUT it
// straight to Storage with the link the API returned, then tell the API it arrived. The API decides what is allowed.
// `show` hears how each file (by its index in `files`) went.
export async function uploadFiles(
  files: File[],
  folderId: string | null,
  show: (index: number, change: Partial<Outcome>) => void,
) {
  // Markdown and text files first, together, so Links between them resolve.
  const text = files.map((file, index) => ({ file, index })).filter((entry) => isText(entry.file));
  for (const entry of text.filter((e) => e.file.size > IMPORT_MAX_BYTES)) {
    // Say so before sending a file the API would refuse anyway.
    show(entry.index, { state: "failed", message: "Markdown and text files can be at most 1 MB (1,000,000 bytes)." });
  }
  for (const batch of batches(text.filter((e) => e.file.size <= IMPORT_MAX_BYTES))) {
    try {
      const form = new FormData();
      for (const entry of batch) form.append("files", entry.file);
      if (folderId) form.append("folderId", folderId);
      const results = await importNotes(form);
      batch.forEach((entry, position) => {
        const imported = results[position];
        show(
          entry.index,
          imported?.ok
            ? { state: "done", href: `/notes/${imported.id}`, label: imported.title || entry.file.name }
            : { state: "failed", message: imported?.message ?? "The file could not be imported." },
        );
      });
    } catch {
      for (const entry of batch) {
        show(entry.index, { state: "failed", message: "The import failed. Check your connection and try again." });
      }
    }
  }
  for (const [index, file] of files.entries()) {
    if (isText(file)) continue;
    try {
      const started = await startUpload(file.name, file.type, file.size, folderId);
      if (!started.ok) {
        show(index, { state: "failed", message: started.message });
        continue;
      }
      const stored = await fetch(started.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!stored.ok) {
        show(index, { state: "failed", message: "The storage service refused the file." });
        continue;
      }
      const finished = await finishUpload(started.uploadId);
      show(
        index,
        finished.ok
          ? { state: "done", href: `/assets/${finished.id}`, label: file.name }
          : { state: "failed", message: finished.message },
      );
    } catch {
      show(index, { state: "failed", message: "The upload failed. Check your connection and try again." });
    }
  }
}
