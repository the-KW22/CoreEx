/// <reference lib="webworker" />
import { type DocumentProps, Font, pdf } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";

import type { components } from "@/lib/api/schema";

import { ResumePdf } from "./template-classic";

// The PDF is made here, off the page's main thread, so typing never waits for a render (ADR 0012).
type Doc = components["schemas"]["ResumeDocument"];
export type Request = { id: number; doc: Doc };
export type Response = { id: number; bytes: ArrayBuffer } | { id: number; error: string };

let registered = false;

// Inter, embedded and subset by react-pdf. When the files cannot be loaded the template falls back to Helvetica.
function registerFonts() {
  const dir = `${self.location.origin}/fonts`;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${dir}/inter-400-normal.woff`, fontWeight: 400, fontStyle: "normal" },
      { src: `${dir}/inter-400-italic.woff`, fontWeight: 400, fontStyle: "italic" },
      { src: `${dir}/inter-700-normal.woff`, fontWeight: 700, fontStyle: "normal" },
      { src: `${dir}/inter-700-italic.woff`, fontWeight: 700, fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

async function render(doc: Doc, fonts: boolean) {
  // react-pdf wants a <Document> element; ResumePdf is a component that returns one.
  const element = createElement(ResumePdf, { doc, fonts: { registered: fonts } }) as ReactElement<DocumentProps>;
  const blob = await pdf(element).toBlob();
  return blob.arrayBuffer();
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, doc } = event.data;
  try {
    if (!registered) registerFonts();
    let bytes: ArrayBuffer;
    try {
      bytes = await render(doc, true);
    } catch {
      // The font files did not load (or one has a glyph the face cannot draw): the built-in font still gives a PDF.
      bytes = await render(doc, false);
    }
    const reply: Response = { id, bytes };
    (self as DedicatedWorkerGlobalScope).postMessage(reply, [bytes]);
  } catch (e) {
    const reply: Response = { id, error: e instanceof Error ? e.message : "Could not draw the page." };
    (self as DedicatedWorkerGlobalScope).postMessage(reply);
  }
};
