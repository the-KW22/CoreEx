"use client";

import { DownloadIcon, PrinterIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { useResumePdf } from "@/lib/resume/use-resume-pdf";

type Doc = components["schemas"]["ResumeDocument"];

// A PDF point is 1/72 inch; a CSS pixel 1/96, so 100% is the size the page prints at.
const POINT = 96 / 72;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fileName(title: string) {
  return `${title.replace(/[^\p{L}\p{N} _.-]+/gu, "").trim() || "Resume"}.pdf`;
}

// The page as it will print: the PDF the worker made, drawn at real size with pdfjs. Download and Print use those very
// bytes, so what is shown is what is saved.
export function Preview({ doc, title }: { doc: Doc; title: string }) {
  const { bytes, error, busy } = useResumePdf(doc);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(0);
  const [drawError, setDrawError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);

  // Draws every page onto its own canvas whenever the PDF or the zoom changes. pdfjs is loaded here, not at the top,
  // because it needs the browser.
  useEffect(() => {
    if (!bytes || !host.current) return;
    const container = host.current;
    let stale = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        // pdfjs takes the buffer it is given, so it gets a copy: the original is still needed to download.
        const loaded = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        const canvases: HTMLCanvasElement[] = [];
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= loaded.numPages; n++) {
          const page = await loaded.getPage(n);
          const viewport = page.getViewport({ scale: POINT * zoom * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${viewport.width / ratio}px`;
          canvas.style.height = `${viewport.height / ratio}px`;
          canvas.className = "bg-white shadow-sm";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Page ${n} of ${loaded.numPages}`);
          await page.render({ canvas, viewport }).promise;
          canvases.push(canvas);
        }
        if (stale) return;
        container.replaceChildren(...canvases);
        setPages(loaded.numPages);
        setDrawError(null);
      } catch {
        if (!stale) setDrawError("Could not show the page.");
      }
    })();
    return () => {
      stale = true;
    };
  }, [bytes, zoom]);

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

  return (
    <section aria-label="Page preview" className="grid content-start gap-3">
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
      {(error || drawError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? drawError}
        </p>
      )}
      <div ref={host} role="region" aria-label="Pages" tabIndex={0} className="grid max-h-[80vh] justify-center gap-4 overflow-auto rounded-lg border border-border bg-muted p-4" />
    </section>
  );
}
