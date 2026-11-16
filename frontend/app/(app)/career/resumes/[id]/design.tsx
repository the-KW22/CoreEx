"use client";

import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { TEMPLATES, type Template, templateOf } from "@/lib/resume/blocks";
import { useResumePdf } from "@/lib/resume/use-resume-pdf";
import { cn } from "@/lib/utils";

type Doc = components["schemas"]["ResumeDocument"];

const THUMB_WIDTH = 200;

// The first page of the Resume in one template, small: the same worker and renderer as the main preview, with the
// User's own content, so a card shows how their Resume would look.
function Thumbnail({ doc, template, label, photoSrc }: { doc: Doc; template: Template; label: string; photoSrc: string | null }) {
  // The same object while nothing changed: a new one each render would send the document to the worker again.
  const shown = useMemo(() => ({ ...doc, metadata: { ...doc.metadata, template } }), [doc, template]);
  const { bytes, error } = useResumePdf(shown, photoSrc);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!bytes) return;
    let stale = false;
    let task: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdfjs.getDocument({ data: bytes.slice() });
        const page = await (await task.promise).getPage(1);
        const ratio = window.devicePixelRatio || 1;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (THUMB_WIDTH / base.width) * ratio });
        const off = document.createElement("canvas");
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        await page.render({ canvas: off, viewport }).promise;
        const target = canvas.current;
        if (stale || !target) return;
        target.width = off.width;
        target.height = off.height;
        target.style.width = `${THUMB_WIDTH}px`;
        target.style.height = `${(THUMB_WIDTH * base.height) / base.width}px`;
        target.getContext("2d")?.drawImage(off, 0, 0);
      } catch {
        // The card then shows an empty page; the main preview reports real problems.
      }
    })();
    return () => {
      stale = true;
      void task?.destroy();
    };
  }, [bytes]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={error ? `${label} could not be drawn` : `${label} template with your content`}
      className="bg-white shadow-sm"
      style={{ width: THUMB_WIDTH, height: THUMB_WIDTH * 1.414 }}
    />
  );
}

// Design mode: the templates, each drawn with the Resume's own content. Choosing one shows it in the page preview
// without changing the Resume; Use this template applies it (one Undo step), Cancel drops it.
export function Design({
  doc,
  candidate,
  locked,
  photoSrc,
  onCandidate,
  onApply,
}: {
  doc: Doc;
  candidate: Template | null;
  locked: boolean;
  photoSrc: string | null;
  onCandidate: (template: Template | null) => void;
  onApply: (template: Template) => void;
}) {
  const current = templateOf(doc);
  return (
    <section aria-labelledby="templates" className="grid gap-3">
      <h2 id="templates" className="text-lg font-semibold">
        Template
      </h2>
      <p className="text-sm text-muted-foreground">Your content stays the same in every template.</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4" aria-label="Templates">
        {TEMPLATES.map((t) => {
          const shown = candidate ?? current;
          return (
            <li key={t.value} className={cn("grid content-start gap-2 rounded-lg border border-border p-3", shown === t.value && "border-link")}>
              <Thumbnail doc={doc} template={t.value} label={t.label} photoSrc={photoSrc} />
              <p className="font-medium">
                {t.label}
                {current === t.value && <span className="ml-2 text-sm font-normal text-muted-foreground">In use</span>}
              </p>
              <p className="text-sm text-muted-foreground">{t.about}</p>
              {candidate === t.value ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={locked || candidate === current} onClick={() => onApply(t.value)}>
                    Use this template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => onCandidate(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div>
                  <Button type="button" variant="outline" size="sm" disabled={current === t.value && candidate === null} onClick={() => onCandidate(t.value)}>
                    Preview {t.label}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
