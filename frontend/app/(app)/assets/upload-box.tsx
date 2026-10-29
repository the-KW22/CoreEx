"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { importNotes } from "../notes/actions";
import { finishUpload, startUpload } from "./actions";

type Outcome = { name: string; state: "uploading" | "done" | "failed"; message?: string; href?: string; label?: string };

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

// Drag files here or choose them. A .md or .txt file is imported as a Note. Any other file is kept as an Asset: ask the
// API (type, size, quota), PUT it straight to Storage with the link the API returned, then tell the API it arrived.
// The API, not this component, decides what is allowed.
export function UploadBox({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = (index: number, change: Partial<Outcome>) =>
    setOutcomes((all) => all.map((o, i) => (i === index ? { ...o, ...change } : o)));

  async function uploadAll(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setOutcomes(files.map((file) => ({ name: file.name, state: "uploading" })));
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
    setBusy(false);
    router.refresh();
  }

  return (
    <section
      className={dragging ? "upload-box dragging" : "upload-box"}
      aria-label="Add files"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void uploadAll([...event.dataTransfer.files]);
      }}
    >
      <p>Drop files here, or</p>
      <input
        ref={input}
        type="file"
        multiple
        accept=".md,.txt,image/png,image/jpeg,image/webp,image/gif,application/pdf"
        aria-label="Choose files to add"
        disabled={busy}
        onChange={(event) => {
          void uploadAll([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <p className="upload-hint">
        Markdown and text files (.md, .txt, up to 1 MB) become Notes. Images and PDFs (PNG, JPG, WebP, GIF, PDF, up to 5
        MB) are kept as Assets.
      </p>
      <ul aria-live="polite">
        {outcomes.map((outcome, index) => (
          <li key={index}>
            {outcome.state === "uploading" && `Uploading ${outcome.name}…`}
            {outcome.state === "done" && outcome.href && (
              <>
                Added <Link href={outcome.href}>{outcome.label}</Link>
              </>
            )}
            {outcome.state === "failed" && (
              <span role="alert">
                {outcome.name}: {outcome.message}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
