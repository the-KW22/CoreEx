"use client";

import { FileUserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { thumbnailPdf } from "@/lib/resume/thumbnails";

import { loadResume, photoData } from "../resumes/[id]/actions";

const WIDTH = 200;

// The first page of a Resume, drawn when its card scrolls into view. `updatedAt` is part of the cache key, so a
// Resume that changed is drawn again.
export function Thumbnail({ id, updatedAt, title }: { id: string; updatedAt: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let current = true;
    void (async () => {
      const bytes = await thumbnailPdf(`${id}:${updatedAt}`, async () => {
        const resume = await loadResume(id);
        if (!resume) return null;
        const photo = resume.doc.basics.photo;
        return { doc: resume.doc, photoSrc: photo.assetId && photo.visible ? await photoData(photo.assetId) : null };
      });
      if (!bytes) return current && setState("failed");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
        const page = await (await task.promise).getPage(1);
        const base = page.getViewport({ scale: 1 });
        const ratio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: (WIDTH / base.width) * ratio });
        const target = canvas.current;
        if (!current || !target) return void task.destroy();
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        target.style.aspectRatio = `${base.width} / ${base.height}`;
        await page.render({ canvas: target, viewport }).promise;
        void task.destroy();
        if (current) setState("done");
      } catch {
        if (current) setState("failed");
      }
    })();
    return () => {
      current = false;
    };
  }, [visible, id, updatedAt]);

  return (
    <div ref={box} className="grid aspect-[1/1.414] place-items-center overflow-hidden rounded-md border border-border bg-white shadow-sm">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`First page of ${title}`}
        data-state={state}
        className={state === "done" ? "h-full w-full object-contain" : "hidden"}
      />
      {state !== "done" && (
        // The page is white in both themes, so the text on it is a fixed dark grey, not the theme's muted colour.
        <span className="grid place-items-center gap-1 text-xs text-neutral-600">
          <FileUserIcon aria-hidden className="size-6" />
          {state === "failed" ? "No preview" : visible ? "Drawing…" : ""}
        </span>
      )}
    </div>
  );
}
