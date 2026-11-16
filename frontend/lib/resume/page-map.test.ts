import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import type { components } from "@/lib/api/schema";

import { resumeBlocks } from "./blocks";
import { buildPageMap, readPages, segmentsOf, type Box } from "./page-map";
import { SAMPLE } from "./sample";
import { ResumePdf } from "./template-classic";

type Doc = components["schemas"]["ResumeDocument"];

// The map of a real render, as the preview builds it.
async function mapOf(doc: Doc): Promise<{ boxes: Box[]; pages: number }> {
  const bytes = new Uint8Array(await renderToBuffer(createElement(ResumePdf, { doc, fonts: { registered: false } }) as never));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loaded = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  const pages = await readPages(loaded);
  return { boxes: buildPageMap(segmentsOf(resumeBlocks(doc)), pages), pages: pages.length };
}

const round = (boxes: Box[]) =>
  boxes.map((b) => ({ ...b, x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }));

describe("the page map", () => {
  it("finds every field of the sample Resume on page 1 (snapshot)", async () => {
    const { boxes } = await mapOf(SAMPLE);
    expect(round(boxes)).toMatchSnapshot();
  });

  it("puts the name above the first heading, and each field inside its page", async () => {
    const { boxes } = await mapOf(SAMPLE);
    const at = (ref: string) => boxes.find((b) => b.ref === ref)!;
    expect(at("basics.name").y).toBeLessThan(at("section:experience").y);
    expect(at("section:experience").y).toBeLessThan(at("section:education").y);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(595.5);
    }
  });

  it("a long Resume has entries on page 2, and a field split by the page break has a box on each", async () => {
    const doc = structuredClone(SAMPLE);
    doc.sections[0].entries = Array.from({ length: 40 }, (_, i) => ({
      ...doc.sections[0].entries[0],
      id: `e${i}`,
      title: `Engineer ${i}`,
    }));
    const { boxes, pages } = await mapOf(doc);
    expect(pages).toBeGreaterThan(1);
    expect(boxes.find((b) => b.ref === "entry:e0:title")?.page).toBe(1);
    expect(boxes.find((b) => b.ref === "entry:e39:title")?.page).toBe(pages);
  });

  it("a field that was not printed has no box and does not hide the next ones", () => {
    const boxes = buildPageMap(
      [
        { ref: "a", text: "missing words" },
        { ref: "b", text: "Hello world" },
      ],
      [{ width: 100, height: 100, items: [{ str: "Hello", x: 1, y: 90, width: 20, height: 10 }, { str: "world", x: 25, y: 90, width: 20, height: 10 }] }],
    );
    expect(boxes).toEqual([{ ref: "b", page: 1, x: 1, y: 0, width: 44, height: 10 }]);
  });
});
