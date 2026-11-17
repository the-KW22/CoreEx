"use client";

import { useEffect, useRef, useState } from "react";

import type { components } from "@/lib/api/schema";

import type { Request, Response } from "./render.worker";

type Doc = components["schemas"]["ResumeDocument"];

const DEBOUNCE_MS = 300;

// The PDF of the document as it is now, made in a Web Worker a moment after the last change. An answer for an older
// document is ignored, so the newest always wins. `busy` is true from a change until its PDF is back, and `doc` is the
// document the PDF was made from (it can be a moment behind the editor's).
export function useResumePdf(doc: Doc, photoSrc: string | null = null, letter = false) {
  const [result, setResult] = useState<{ bytes: Uint8Array | null; doc: Doc | null; error: string | null; busy: boolean }>({
    bytes: null,
    doc: null,
    error: null,
    busy: true,
  });
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const sent = useRef(new Map<number, Doc>());

  useEffect(() => {
    const w = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (event: MessageEvent<Response>) => {
      const reply = event.data;
      if (reply.id !== latest.current) return;
      const rendered = sent.current.get(reply.id) ?? null;
      sent.current.clear();
      setResult("error" in reply
        ? { bytes: null, doc: null, error: reply.error, busy: false }
        : { bytes: new Uint8Array(reply.bytes), doc: rendered, error: null, busy: false });
    };
    return () => w.terminate();
  }, []);

  useEffect(() => {
    // The new document waits for its debounce; until its PDF arrives the old page stays on screen.
    const timer = setTimeout(() => {
      latest.current += 1;
      sent.current.set(latest.current, doc);
      setResult((r) => ({ ...r, busy: true }));
      const request: Request = { id: latest.current, doc, photoSrc, letter };
      worker.current?.postMessage(request);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [doc, photoSrc, letter]);

  return result;
}
