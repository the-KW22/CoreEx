import path from "node:path";

import { type DocumentProps, Font, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";

import type { components } from "@/lib/api/schema";
import { sharedSecretMatches } from "@/lib/export/pdf-secret";
import { ResumePdf } from "@/lib/resume/templates";

type Doc = components["schemas"]["ResumeDocument"];

// Called by the API while it builds an Export, never by a browser: it draws a Resume's PDF with the same templates as the
// editor. Only the API holds EXPORT_PDF_SECRET; without it set, every call is refused. Nothing here logs the secret.
// Route handlers run on Node by default; the runtime segment config is not allowed with cacheComponents, so it is not set.

let registered = false;

// The Inter files the editor loads from /fonts, read from the project's public folder (react-pdf reads a local path here).
function registerFonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const file = (name: string) => path.join(dir, name);
  Font.register({
    family: "Inter",
    fonts: [
      { src: file("inter-400-normal.woff"), fontWeight: 400, fontStyle: "normal" },
      { src: file("inter-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: file("inter-700-normal.woff"), fontWeight: 700, fontStyle: "normal" },
      { src: file("inter-700-italic.woff"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

async function draw(doc: Doc, photoSrc: string | null, letter: boolean): Promise<Buffer> {
  if (!registered) registerFonts();
  const element = (fonts: boolean) =>
    createElement(ResumePdf, { doc, fonts: { registered: fonts }, photoSrc, letter }) as ReactElement<DocumentProps>;
  try {
    return await renderToBuffer(element(true));
  } catch {
    // The font files did not load (or one has a glyph the face cannot draw): the built-in font still gives a PDF.
    return renderToBuffer(element(false));
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!sharedSecretMatches(request.headers.get("x-export-secret"), process.env.EXPORT_PDF_SECRET)) {
    return Response.json({ code: "UNAUTHORIZED", message: "This route is for the CoreEx API only." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { document?: unknown; photoSrc?: unknown; letter?: unknown } | null;
  const document = body?.document;
  if (!document || typeof document !== "object" || !("metadata" in document)) {
    return Response.json({ code: "INVALID_REQUEST", message: "Send the Resume's document." }, { status: 400 });
  }
  const photoSrc = typeof body?.photoSrc === "string" ? body.photoSrc : null;
  try {
    const bytes = await draw(document as Doc, photoSrc, body?.letter === true);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ code: "PDF_FAILED", message: "The PDF could not be drawn." }, { status: 500 });
  }
}
