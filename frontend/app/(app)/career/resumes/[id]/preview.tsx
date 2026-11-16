"use client";

import { DownloadIcon, PrinterIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { resumeBlocks } from "@/lib/resume/blocks";
import { intendedPages, overflows } from "@/lib/resume/fit";
import { type Box, buildPageMap, readPages, segmentsOf } from "@/lib/resume/page-map";
import { useResumePdf } from "@/lib/resume/use-resume-pdf";

type Doc = components["schemas"]["ResumeDocument"];

// A PDF point is 1/72 inch; a CSS pixel 1/96, so 100% is the size the page prints at.
const POINT = 96 / 72;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// An open PDF and the task that holds it open (pdfjs frees it through the task).
type Open = { pdf: import("pdfjs-dist").PDFDocumentProxy; task: import("pdfjs-dist").PDFDocumentLoadingTask };

function fileName(title: string) {
  return `${title.replace(/[^\p{L}\p{N} _.-]+/gu, "").trim() || "Resume"}.pdf`;
}

// The page as it will print: the PDF the worker made, drawn at real size with pdfjs. Download and Print use those very
// bytes, so what is shown is what is saved. Over each page lie the boxes of the page map: hover outlines a field and a
// click calls `onSelect` with its reference, so the editor can jump to it.
export function Preview({
  doc,
  title,
  onSelect,
  onFit,
  onAddPage,
  fitting,
  photoSrc,
}: {
  doc: Doc;
  title: string;
  onSelect: (ref: string) => void;
  onFit: () => void;
  onAddPage: () => void;
  fitting: boolean;
  photoSrc: string | null;
}) {
  const { bytes, doc: rendered, error, busy } = useResumePdf(doc, photoSrc);
  const [zoom, setZoom] = useState(1);
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loaded, setLoaded] = useState<Open | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const pages = sizes.length;

  // A new PDF: read its pages and, from its text, the page map. pdfjs is loaded here, not at the top, because it needs
  // the browser.
  useEffect(() => {
    if (!bytes || !rendered) return;
    let stale = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        // pdfjs takes the buffer it is given, so it gets a copy: the original is still needed to download.
        const task = pdfjs.getDocument({ data: bytes.slice() });
        const pdf = await task.promise;
        const text = await readPages(pdf);
        if (stale) {
          void task.destroy();
          return;
        }
        setBoxes(buildPageMap(segmentsOf(resumeBlocks(rendered)), text));
        setSizes(text.map((p) => ({ width: p.width, height: p.height })));
        setLoaded({ pdf, task });
        setDrawError(null);
      } catch {
        if (!stale) setDrawError("Could not show the page.");
      }
    })();
    return () => {
      stale = true;
    };
  }, [bytes, rendered]);

  // Draws every page, again when the PDF or the zoom changes. Each page is drawn off screen and then copied, so the old
  // page stays in view until the new one is ready.
  useEffect(() => {
    if (!loaded) return;
    let stale = false;
    void (async () => {
      try {
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= loaded.pdf.numPages; n++) {
          const page = await loaded.pdf.getPage(n);
          const viewport = page.getViewport({ scale: POINT * zoom * ratio });
          const off = document.createElement("canvas");
          off.width = Math.floor(viewport.width);
          off.height = Math.floor(viewport.height);
          await page.render({ canvas: off, viewport }).promise;
          const canvas = canvases.current[n - 1];
          if (stale || !canvas) return;
          if (canvas.width !== off.width) canvas.width = off.width;
          if (canvas.height !== off.height) canvas.height = off.height;
          canvas.getContext("2d")?.drawImage(off, 0, 0);
        }
      } catch {
        if (!stale) setDrawError("Could not show the page.");
      }
    })();
    return () => {
      stale = true;
    };
  }, [loaded, zoom, sizes]);

  // A PDF that a newer one has replaced is let go (after its drawing was marked stale above).
  useEffect(
    () => () => {
      void loaded?.task.destroy();
    },
    [loaded],
  );

  // More pages printed than the Resume means to have: say so, and offer to squeeze it back or to accept the new page.
  const overflow = !busy && rendered !== null && pages > 0 && overflows(pages, rendered);

  const byPage = useMemo(() => Object.groupBy(boxes, (b) => b.page), [boxes]);

  function download() {
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(title);
    link.click();
    URL.revokeObjectURL(url);
  }

  function print() {
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    frame.src = url;
    frame.onload = () => {
      frame.contentWindow?.print();
      // The print dialog holds the page; it is cleaned up a minute later.
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    document.body.append(frame);
  }

  const step = (direction: 1 | -1) => {
    const at = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + direction))]);
  };

  const scale = POINT * zoom;
  return (
    <section aria-label="Page preview" className="grid min-w-0 content-start gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Zoom out" disabled={zoom === ZOOMS[0]} onClick={() => step(-1)}>
          <ZoomOutIcon aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="sm" aria-label={`Reset zoom, now ${Math.round(zoom * 100)}%`} onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Zoom in" disabled={zoom === ZOOMS.at(-1)} onClick={() => step(1)}>
          <ZoomInIcon aria-hidden />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!bytes} onClick={download}>
            <DownloadIcon aria-hidden />
            Download PDF
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!bytes} onClick={print}>
            <PrinterIcon aria-hidden />
            Print
          </Button>
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {error || drawError ? "" : busy ? "Updating the page…" : pages > 0 ? `${pages} ${pages === 1 ? "page" : "pages"}` : ""}
      </p>
      {overflow && rendered && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <p role="status" className="mr-auto">
            This Resume runs onto page {intendedPages(rendered) + 1}.
          </p>
          <Button type="button" variant="outline" size="sm" disabled={fitting} onClick={onFit}>
            {fitting ? "Fitting…" : "Fit to page"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={fitting} onClick={onAddPage}>
            Add a page
          </Button>
        </div>
      )}
      {(error || drawError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? drawError}
        </p>
      )}
      <div role="region" aria-label="Pages" tabIndex={0} className="flex max-h-[80vh] flex-col gap-4 overflow-auto rounded-lg border border-border bg-muted p-4">
        {sizes.map((size, i) => (
          <div key={i} data-page={i + 1} className="relative mx-auto shrink-0 bg-white shadow-sm" style={{ width: size.width * scale, height: size.height * scale }}>
            <canvas
              ref={(el) => {
                canvases.current[i] = el;
              }}
              role="img"
              aria-label={`Page ${i + 1} of ${pages}`}
              style={{ width: size.width * scale, height: size.height * scale }}
            />
            {/* Mouse only: the form beside the page is the keyboard route to every field. */}
            <div aria-hidden>
              {(byPage[i + 1] ?? []).map((box, n) => (
                <div
                  key={n}
                  data-ref={box.ref}
                  onClick={() => onSelect(box.ref)}
                  className="absolute cursor-pointer rounded-sm outline outline-1 outline-transparent hover:bg-link/10 hover:outline-link"
                  style={{ left: box.x * scale - 2, top: box.y * scale - 2, width: box.width * scale + 4, height: box.height * scale + 4 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
