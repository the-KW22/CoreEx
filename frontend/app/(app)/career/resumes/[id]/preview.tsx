"use client";

import { DownloadIcon, Maximize2Icon, PrinterIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { components } from "@/lib/api/schema";
import { resumeBlocks } from "@/lib/resume/blocks";
import { intendedPages, overflows } from "@/lib/resume/fit";
import { type Box, buildPageMap, readPages, segmentsOf } from "@/lib/resume/page-map";
import { useResumePdf } from "@/lib/resume/use-resume-pdf";
import type { CheckIssue } from "@/lib/resume/check";
import { comparePdfText, extractedText } from "@/lib/resume/parser";
import { cn } from "@/lib/utils";

type Doc = components["schemas"]["ResumeDocument"];

// A PDF point is 1/72 inch; a CSS pixel 1/96, so 100% is the size the page prints at.
const POINT = 96 / 72;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
// The pages region's padding (p-4) on both sides, in CSS pixels.
const GUTTER = 32;

// An open PDF and the task that holds it open (pdfjs frees it through the task).
type Open = { pdf: import("pdfjs-dist").PDFDocumentProxy; task: import("pdfjs-dist").PDFDocumentLoadingTask };

function fileName(title: string) {
  return `${title.replace(/[^\p{L}\p{N} _.-]+/gu, "").trim() || "Resume"}.pdf`;
}

// The page as it will print: the PDF the worker made, drawn at real size with pdfjs. Download and Print use those very
// bytes, so what is shown is what is saved. Over each page lie the boxes of the page map: hover outlines a field and a
// click calls `onSelect` with its reference, so the editor can jump to it.
// With `fill`, the column takes the height its parent gives it and the pages scroll inside it (the editor's sticky column).
export function Preview({
  doc,
  title,
  onSelect,
  onFit,
  onAddPage,
  fitting,
  fitNote = "",
  fill = false,
  photoSrc,
  onMarkdown,
  markdownAvailable,
  pins,
  checkMode,
  letterDocument,
}: {
  doc: Doc;
  title: string;
  onSelect: (ref: string) => void;
  onFit: () => void;
  onAddPage: () => void;
  fitting: boolean;
  // Why Fit to page could not fit the Resume. It is shown in the overflow banner, which it describes.
  fitNote?: string;
  fill?: boolean;
  photoSrc: string | null;
  onMarkdown: () => Promise<string | null>;
  markdownAvailable: boolean;
  pins: CheckIssue[];
  checkMode: boolean;
  letterDocument?: components["schemas"]["CoverLetterDocument"];
}) {
  const isLetter = !!letterDocument;
  const { bytes, doc: rendered, error, busy } = useResumePdf(doc, photoSrc, isLetter);
  // Fit width (the default) makes the page as wide as the pages region; a zoom step or 100% leaves it.
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loaded, setLoaded] = useState<Open | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [parser, setParser] = useState(false);
  const [extracted, setExtracted] = useState("");
  const [parsedDoc, setParsedDoc] = useState<Doc | null>(null);
  const [pdfWarnings, setPdfWarnings] = useState<string[] | null>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const region = useRef<HTMLDivElement>(null);
  const pages = sizes.length;

  // The width of the pages region, so Fit width can work out the zoom that fills it.
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        setBoxes(buildPageMap(segmentsOf(resumeBlocks(rendered, isLetter)), text));
        setExtracted(extractedText(text));
        setParsedDoc(rendered);
        setPdfWarnings(null);
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
  }, [bytes, rendered, isLetter]);

  // The zoom in use: the width fit, rounded down so the page never spills, or the chosen one.
  const pageWidth = sizes[0]?.width ?? 0;
  const fitZoom = pageWidth && width > GUTTER ? Math.floor(((width - GUTTER) / (pageWidth * POINT)) * 100) / 100 : 1;
  const effective = fit ? fitZoom : zoom;
  const up = ZOOMS.find((z) => z > effective + 0.001);
  const down = [...ZOOMS].reverse().find((z) => z < effective - 0.001);

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
          const viewport = page.getViewport({ scale: POINT * effective * ratio });
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
  }, [loaded, effective, sizes]);

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
  const pinFor = (issue: CheckIssue): Box | undefined => {
    const exact = boxes.find((box) => box.ref === issue.ref);
    if (exact) return exact;
    const entryId = /^entry:([^:]+):/.exec(issue.ref)?.[1];
    const section = entryId && doc.sections.find((item) => item.entries.some((entry) => entry.id === entryId));
    return boxes.find((box) => box.ref === (section ? `section:${section.id}` : "basics.name")) ??
      (sizes.length ? { ref: issue.ref, page: 1, x: 8, y: 8, width: 0, height: 0 } : undefined);
  };

  function download() {
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(title);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadFormat(format: "docx" | "md" | "json") {
    try {
      setDownloadError(null);
      let blob: Blob;
      if (format === "docx") blob = await (await import("@/lib/resume/word")).resumeWord(doc, !!letterDocument);
      else if (format === "json") blob = new Blob([JSON.stringify(letterDocument ?? doc, null, 2)], { type: "application/json" });
      else {
        const markdown = await onMarkdown();
        if (markdown === null) throw new Error("Markdown unavailable");
        blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(title).replace(/\.pdf$/, `.${format}`);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError(`Could not download the ${isLetter ? "Cover Letter" : "Resume"}. Save changes or reload if it changed elsewhere, then try again.`);
    }
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

  const scale = POINT * effective;
  return (
    <section aria-label="Page preview" className={cn("flex min-w-0 flex-col gap-3", fill && "lg:h-full")}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Zoom out" disabled={!down} onClick={() => { if (down) { setFit(false); setZoom(down); } }}>
          <ZoomOutIcon aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="sm" aria-label={`Reset zoom, now ${Math.round(effective * 100)}%`} onClick={() => { setFit(false); setZoom(1); }}>
          {Math.round(effective * 100)}%
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Zoom in" disabled={!up} onClick={() => { if (up) { setFit(false); setZoom(up); } }}>
          <ZoomInIcon aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={fit} className={cn(fit && "bg-surface font-medium")} onClick={() => setFit(true)}>
          <Maximize2Icon aria-hidden />
          Fit width
        </Button>
        <div className="ml-auto flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <DownloadIcon aria-hidden />
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!bytes} onSelect={download}>
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void downloadFormat("docx")}>Download Word</DropdownMenuItem>
              <DropdownMenuItem disabled={!markdownAvailable} onSelect={() => void downloadFormat("md")}>
                Download Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void downloadFormat("json")}>
                Download JSON
                {!letterDocument && <span className="block text-xs text-muted-foreground">The JSON backup includes private notes.</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" size="sm" disabled={!bytes} onClick={print}>
            <PrinterIcon aria-hidden />
            Print
          </Button>
        </div>
      </div>
      {checkMode && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!loaded || busy || rendered !== parsedDoc} onClick={() => setParser(!parser)}>{parser ? "Hide parser text" : "See what a parser reads"}</Button>
        <Button type="button" variant="outline" size="sm" disabled={!rendered || busy || !loaded || rendered !== parsedDoc} onClick={() => setPdfWarnings(comparePdfText(segmentsOf(resumeBlocks(rendered!)).map((s) => s.text), extracted))}>Check exported PDF</Button>
      </div>}
      {checkMode && !busy && rendered === parsedDoc && pdfWarnings && <p role="status" className="text-sm">{pdfWarnings.length ? `PDF check: ${pdfWarnings.map((w) => w.replaceAll("-", " ")).join(", ")}.` : "PDF text matches the Resume."}</p>}
      {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
      <p role="status" className="text-sm text-muted-foreground">
        {error || drawError ? "" : busy ? "Updating the page…" : pages > 0 ? `${pages} ${pages === 1 ? "page" : "pages"}` : ""}
      </p>
      {overflow && rendered && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <p role="status" className="mr-auto">
            This {isLetter ? "Cover Letter" : "Resume"} runs onto page {intendedPages(rendered) + 1}.
          </p>
          <Button type="button" variant="outline" size="sm" disabled={fitting} onClick={onFit}>
            {fitting ? "Fitting…" : "Fit to page"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={fitting} onClick={onAddPage}>
            Add a page
          </Button>
          {fitNote && <p className="w-full">{fitNote}</p>}
        </div>
      )}
      {(error || drawError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? drawError}
        </p>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col gap-4", checkMode && parser && "lg:flex-row")}>
      <div
        ref={region}
        role="region"
        aria-label="Pages"
        tabIndex={0}
        className={cn(
          "flex min-w-0 flex-col gap-4 overflow-auto rounded-lg border border-border bg-muted p-4",
          // Fills the column when it is given a height; on a phone it keeps the cap of the page list.
          fill ? "max-h-[80vh] min-h-0 flex-1 lg:max-h-none" : "max-h-[80vh]",
        )}
      >
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
            {pins.flatMap((issue, index) => { const box = pinFor(issue); return box?.page === i + 1 ? [(
              <button key={issue.id} type="button" aria-label={`Issue ${index + 1}: ${issue.message}`} onClick={() => onSelect(issue.ref)}
                className="absolute z-10 rounded-full bg-primary px-2 text-sm font-semibold text-primary-foreground" style={{ left: Math.min(box.x * scale + (index % 5) * 24, size.width * scale - 32), top: Math.min(box.y * scale + Math.floor(index / 5) * 24, size.height * scale - 24) }}>
                {index + 1}
              </button>
            )] : []; })}
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
      {checkMode && parser && <section aria-label="Text read from PDF" className="max-h-[80vh] min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-4 lg:max-h-none">{extracted || "No selectable text was found."}</section>}
      </div>
    </section>
  );
}
