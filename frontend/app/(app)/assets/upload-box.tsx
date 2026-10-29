"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { finishUpload, startUpload } from "./actions";

type Outcome = { name: string; state: "uploading" | "done" | "failed"; message?: string; id?: string };

// Drag files here or choose them. Each file: ask the API (type, size, quota), PUT it straight to Storage with the
// link the API returned, then tell the API it arrived. The API, not this component, decides what is allowed.
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
    for (const [index, file] of files.entries()) {
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
        show(index, finished.ok ? { state: "done", id: finished.id } : { state: "failed", message: finished.message });
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
      aria-label="Upload files"
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
      <p>Drop images or PDFs here, or</p>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        aria-label="Choose files to upload"
        disabled={busy}
        onChange={(event) => {
          void uploadAll([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <p className="upload-hint">PNG, JPG, WebP, GIF or PDF, up to 5 MB each.</p>
      <ul aria-live="polite">
        {outcomes.map((outcome, index) => (
          <li key={index}>
            {outcome.state === "uploading" && `Uploading ${outcome.name}…`}
            {outcome.state === "done" && outcome.id && (
              <>
                Uploaded <Link href={`/assets/${outcome.id}`}>{outcome.name}</Link>
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
