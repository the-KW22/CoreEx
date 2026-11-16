"use client";

import { useEffect, useRef, useState } from "react";

import type { components } from "@/lib/api/schema";

import type { Request, Response } from "./render.worker";

type Doc = components["schemas"]["ResumeDocument"];

const DEBOUNCE_MS = 300;

// The PDF of the document as it is now, made in a Web Worker a moment after the last change. An answer for an older
// document is ignored, so the newest always wins. `busy` is true from a change until its PDF is back.
export function useResumePdf(doc: Doc) {
  const [result, setResult] = useState<{ bytes: Uint8Array | null; error: string | null; busy: boolean }>({
    bytes: null,
    error: null,
    busy: true,
  });
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.id !== latest.current) return;
      setResult("error" in event.data
        ? { bytes: null, error: event.data.error, busy: false }
        : { bytes: new Uint8Array(event.data.bytes), error: null, busy: false });
    };
    return () => w.terminate();
  }, []);

  useEffect(() => {
    // The new document waits for its debounce; until its PDF arrives the old page stays on screen.
    const timer = setTimeout(() => {
      latest.current += 1;
      setResult((r) => ({ ...r, busy: true }));
      const request: Request = { id: latest.current, doc };
      worker.current?.postMessage(request);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [doc]);

  return result;
}
