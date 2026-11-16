"use client";

import { DownloadIcon, PaperclipIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatBytes } from "@/lib/items";

import { uploadFiles } from "../../../assets/upload-files";
import { attachDocument, detachDocument, documentUrl } from "../actions";

type Document = components["schemas"]["DocumentResponse"];
type Label = Document["label"];

const LABELS: { label: Label; text: string }[] = [
  { label: "RESUME", text: "Resume" },
  { label: "COVER_LETTER", text: "Cover letter" },
  { label: "OTHER", text: "Other" },
];
const labelText = (label: Label) => LABELS.find((l) => l.label === label)?.text ?? label;

// The PDFs actually sent for this Application. Each is an Asset (it shows in Assets too), kept with a label; detaching
// one leaves the Asset alone.
export function Documents({ applicationId, documents }: { applicationId: string; documents: Document[] }) {
  const [label, setLabel] = useState<Label>("RESUME");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    setBusy(true);
    let assetId: string | null = null;
    // The usual upload: the API checks type, size and quota, the browser PUTs the file to Storage, the API confirms.
    await uploadFiles([file], null, (_, change) => {
      if (change.state === "done" && change.href) assetId = change.href.split("/").pop() ?? null;
      else if (change.state === "failed") toast.error(`${file.name}: ${change.message}`);
    });
    if (assetId && (await attachDocument(applicationId, assetId, label))) toast.success(`Attached ${file.name}`);
    else if (assetId) toast.error(`${file.name} was uploaded but could not be attached. Find it in Assets.`);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <section aria-labelledby="documents-heading" className="grid gap-3">
      <h2 id="documents-heading" className="text-sm font-medium">
        PDFs you sent
      </h2>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing attached yet.</p>
      ) : (
        <ul className="grid gap-2 text-sm">
          {documents.map((d) => (
            <li key={d.assetId} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border px-3 py-2">
              <PaperclipIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <Link href={`/assets/${d.assetId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {d.title}
              </Link>
              <span className="text-muted-foreground">
                {labelText(d.label)} · {formatBytes(d.sizeBytes)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Download ${d.title}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const url = await documentUrl(d.assetId);
                    if (url) window.location.assign(url);
                    else toast.error("Could not get the file. Try again.");
                  })
                }
              >
                <DownloadIcon aria-hidden />
                Download
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Detach ${d.title}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    if (!(await detachDocument(applicationId, d.assetId))) toast.error("Could not detach it. Try again.");
                  })
                }
              >
                <XIcon aria-hidden />
                Detach
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          This PDF is a
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value as Label)}
            className="h-9 rounded-lg border border-border bg-surface px-3"
          >
            {LABELS.map((l) => (
              <option key={l.label} value={l.label}>
                {l.text}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Attaching…" : "Attach a PDF"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          aria-label="PDF file"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
      </div>
    </section>
  );
}
