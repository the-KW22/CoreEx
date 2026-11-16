"use client";

import type { components } from "@/lib/api/schema";

import type { Request, Response } from "./render.worker";

type Doc = components["schemas"]["ResumeDocument"];

// Prints documents one after another in a worker of its own and says how many pages each came to: what Fit to page asks
// while it tries tighter settings. `close` ends the worker.
export function createMeasurer(photoSrc: string | null = null) {
  const worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
  let id = 0;

  const bytesOf = (doc: Doc) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const mine = ++id;
      worker.onmessage = (event: MessageEvent<Response>) => {
        if (event.data.id !== mine) return;
        if ("error" in event.data) reject(new Error(event.data.error));
        else resolve(event.data.bytes);
      };
      worker.onerror = () => reject(new Error("The page could not be drawn."));
      const request: Request = { id: mine, doc, photoSrc };
      worker.postMessage(request);
    });

  return {
    async pagesFor(doc: Doc): Promise<number> {
      const bytes = await bytesOf(doc);
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      const pages = (await task.promise).numPages;
      void task.destroy();
      return pages;
    },
    close: () => worker.terminate(),
  };
}
