"use client";

import type { components } from "@/lib/api/schema";

import type { Request, Response } from "./render.worker";

type Doc = components["schemas"]["ResumeDocument"];

// The first page of a Resume as small pictures for the library. One worker makes every PDF, one at a time (fifty
// workers each loading react-pdf would cost more than the library is worth), and a Resume is drawn again only after
// it changed: the key names the Resume and the time of its last change. Written with the same renderer as the
// page preview, so a thumbnail is the first page of the very PDF the editor shows.
let worker: Worker | null = null;
let ids = 0;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<ArrayBuffer | null>>();

function render(doc: Doc, photoSrc: string | null): Promise<ArrayBuffer | null> {
  worker ??= new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const mine = ++ids;
  return new Promise((resolve) => {
    w.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.id === mine) resolve("error" in event.data ? null : event.data.bytes);
    };
    w.onerror = () => resolve(null);
    const request: Request = { id: mine, doc, photoSrc };
    w.postMessage(request);
  });
}

// The PDF of a Resume, or null when it could not be made. `load` reads the document (and the picture of its photo);
// it runs only for a Resume that has not been drawn since it last changed.
export function thumbnailPdf(key: string, load: () => Promise<{ doc: Doc; photoSrc: string | null } | null>): Promise<ArrayBuffer | null> {
  const found = cache.get(key);
  if (found) return found;
  const next: Promise<ArrayBuffer | null> = queue.then(async () => {
    const loaded = await load().catch(() => null);
    return loaded ? render(loaded.doc, loaded.photoSrc) : null;
  });
  queue = next;
  cache.set(key, next);
  return next;
}
