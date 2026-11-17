"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/applications";
import type { components } from "@/lib/api/schema";
import { letterForPdf } from "@/lib/resume/letter";
import { useResumePdf } from "@/lib/resume/use-resume-pdf";

import { photoData } from "../../resumes/[id]/actions";
import { liveDocument } from "./attachment-actions";

type Linked = components["schemas"]["LinkedDocument"];
type Resume = components["schemas"]["ResumeDocument"];
type Letter = components["schemas"]["CoverLetterDocument"];

const LABEL: Record<Linked["kind"], string> = { RESUME: "Resume", COVER_LETTER: "Cover Letter" };

// The file name without the characters Windows and Mac file names cannot hold.
const fileName = (title: string) =>
  `${[...title].filter((c) => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c)).join("").trim() || "Document"}.pdf`;

// One PDF download per linked document: the Sent snapshot when it was sent, else the current version.
export function AttachmentDownloads({ linked }: { linked: Linked[] }) {
  return (
    <section aria-labelledby="attachment-downloads" className="grid gap-3">
      <h2 id="attachment-downloads" className="text-sm font-medium">
        PDFs to attach
      </h2>
      {linked
        .filter((item) => item.sentAt || item.itemId)
        .map((item) => (
          <AttachmentRow key={`${item.kind}-${item.itemId}-${item.sentAt}`} linked={item} />
        ))}
    </section>
  );
}

// Fetches the document and its photo first, so the PDF is only made from what will be sent.
function AttachmentRow({ linked }: { linked: Linked }) {
  const { kind, itemId, sentAt, sentTitle, sentDocument } = linked;
  const label = LABEL[kind];
  const letter = kind === "COVER_LETTER";
  const [live, setLive] = useState<{ title: string; document: Resume | Letter } | null | undefined>();
  const [photo, setPhoto] = useState<{ id: string; src: string | null } | null>(null);

  useEffect(() => {
    if (sentAt || !itemId) return;
    let current = true;
    void liveDocument(kind, itemId).then((value) => {
      if (current) setLive(value);
    });
    return () => {
      current = false;
    };
  }, [sentAt, kind, itemId]);

  const title = sentAt ? sentTitle ?? label : live?.title ?? label;
  const raw = sentAt ? (sentDocument as Resume | Letter | null) : (live?.document ?? null);
  // A Cover Letter is drawn the way the letter editor draws it.
  const doc = useMemo(() => (raw && letter ? letterForPdf(raw as Letter) : (raw as Resume | null)), [raw, letter]);
  const photoId = raw ? (letter ? (raw as Letter).sender.photo.assetId : (raw as Resume).basics.photo.assetId) : null;

  useEffect(() => {
    if (!photoId) return;
    let current = true;
    void photoData(photoId).then((src) => {
      if (current) setPhoto({ id: photoId, src });
    });
    return () => {
      current = false;
    };
  }, [photoId]);

  if (!sentAt && live === undefined) return <p className="text-sm">Loading {label}…</p>;
  if (!doc) return <p role="alert" className="text-sm">Could not load the {label}.</p>;
  const ready = !photoId || photo?.id === photoId;

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{sentAt ? `Sent on ${formatDay(sentAt)}` : "Current version"}</p>
      {ready ? (
        <PdfDownload doc={doc} photoSrc={photo?.id === photoId ? photo?.src ?? null : null} letter={letter} title={title} label={label} />
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          Preparing PDF…
        </Button>
      )}
    </div>
  );
}

function PdfDownload({ doc, photoSrc, letter, title, label }: { doc: Resume; photoSrc: string | null; letter: boolean; title: string; label: string }) {
  const { bytes, busy, error } = useResumePdf(doc, photoSrc, letter);
  const [url, setUrl] = useState<string | null>(null);

  // The object URL lives while these bytes are the ones offered; it is revoked when they are replaced or the row goes.
  useEffect(() => {
    if (!bytes) return;
    const next = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
    // The URL is a browser resource that exists only once the effect has made it, so it is kept in state for the render.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Object URLs are created in the browser, after render.
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes]);

  if (error) return <p role="alert">Could not make the PDF of this {label}. Try again.</p>;
  if (busy || !url) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        Preparing PDF…
      </Button>
    );
  }
  return (
    <a href={url} download={fileName(title)} className={buttonVariants({ variant: "outline", size: "sm" })}>
      Download PDF
    </a>
  );
}
