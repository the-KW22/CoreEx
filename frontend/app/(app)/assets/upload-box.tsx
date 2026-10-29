"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ACCEPT_FILES, type Outcome, uploadFiles } from "./upload-files";

// Drag files here or choose them; uploadFiles does the work.
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
    await uploadFiles(files, folderId, show);
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
        accept={ACCEPT_FILES}
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
