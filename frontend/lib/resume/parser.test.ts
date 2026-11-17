import { describe, expect, it } from "vitest";
import { comparePdfText, extractedText } from "./parser";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { readPages, segmentsOf } from "./page-map";
import { resumeBlocks } from "./blocks";
import { SAMPLE } from "./sample";
import { ResumePdf } from "./templates";

describe("PDF parser", () => {
  it.each(["classic", "sidebar"])("checks the actual %s PDF without a false warning", async (template) => {
    const doc = structuredClone(SAMPLE);
    doc.metadata.template = template;
    const bytes = new Uint8Array(await renderToBuffer(createElement(ResumePdf, { doc, fonts: { registered: false } }) as never));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: bytes, verbosity: 0 });
    const pages = await readPages(await task.promise);
    expect(comparePdfText(segmentsOf(resumeBlocks(doc)).map((s) => s.text), extractedText(pages))).toEqual([]);
    await task.destroy();
  });
  it("preserves the order of text items on each page", () => {
    expect(extractedText([{ width: 600, height: 800, items: [
      { str: "Sidebar", x: 20, y: 700, width: 30, height: 10 },
      { str: "Main column", x: 300, y: 700, width: 60, height: 10 },
    ] }])).toBe("Sidebar Main column");
  });
  it("reports missing, out of order and unselectable text", () => {
    expect(comparePdfText(["one", "two"], "one two")).toEqual([]);
    expect(comparePdfText(["one", "two"], "two one")).toContain("out-of-order");
    expect(comparePdfText(["one", "two"], "one")).toContain("missing");
    expect(comparePdfText(["one"], "")).toContain("not-selectable");
  });
});
