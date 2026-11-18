import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import type { components } from "@/lib/api/schema";

import { resumeBlocks } from "./blocks";
import { buildPageMap, readPages, segmentsOf, type Box } from "./page-map";
import { SAMPLE } from "./sample";
import { ResumePdf } from "./templates";

type Doc = components["schemas"]["ResumeDocument"];

// The map of a real render, as the preview builds it.
async function mapOf(doc: Doc): Promise<{ boxes: Box[]; pages: number; sizes: { width: number; height: number }[] }> {
  const bytes = new Uint8Array(await renderToBuffer(createElement(ResumePdf, { doc, fonts: { registered: false } }) as never));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loaded = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  const pages = await readPages(loaded);
  return { boxes: buildPageMap(segmentsOf(resumeBlocks(doc)), pages), pages: pages.length, sizes: pages.map((p) => ({ width: p.width, height: p.height })) };
}

const round = (boxes: Box[]) =>
  boxes.map((b) => ({ ...b, x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }));

describe("the page map", () => {
  it("finds every field of the sample Resume on page 1 (snapshot)", async () => {
    const { boxes } = await mapOf(SAMPLE);
    expect(round(boxes)).toMatchSnapshot();
  });

  // The name's line used to inherit the page's line height (about 13 pt for a 22 pt name), so its box ran into the headline.
  it("keeps the name clear of the headline below it", async () => {
    for (const template of ["classic", "sidebar", "modern"]) {
      const doc = structuredClone(SAMPLE);
      doc.metadata.template = template;
      const { boxes } = await mapOf(doc);
      const at = (ref: string) => boxes.find((b) => b.ref === ref)!;
      expect(at("basics.name").y + at("basics.name").height, template).toBeLessThanOrEqual(at("basics.headline").y);
    }
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

  it.each(["classic", "sidebar", "modern"])("the %s template prints every section and the map finds its fields", async (template) => {
    const doc = structuredClone(SAMPLE);
    doc.metadata.template = template;
    const { boxes, pages } = await mapOf(doc);
    expect(pages).toBe(1);
    for (const ref of ["basics.name", "section:experience", "section:education", "section:skills", "entry:exp-1:title", "entry:skill-1:keywords"]) {
      expect(boxes.some((b) => b.ref === ref), `${template}: ${ref}`).toBe(true);
    }
    expect(round(boxes)).toMatchSnapshot();
  });

  it("the sidebar template sits its skills beside the main column, not below it", async () => {
    const doc = structuredClone(SAMPLE);
    doc.metadata.template = "sidebar";
    const { boxes } = await mapOf(doc);
    const at = (ref: string) => boxes.find((b) => b.ref === ref)!;
    expect(at("section:skills").x).toBeLessThan(at("section:experience").x);
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

// Each design control changes what is printed: the map of a Resume with one setting changed, against the sample.
describe("the design settings change the PDF", () => {
  const change = async (edit: (doc: Doc) => void) => {
    const doc = structuredClone(SAMPLE);
    edit(doc);
    return mapOf(doc);
  };
  const at = (boxes: Box[], ref: string) => boxes.find((b) => b.ref === ref)!;

  it("text size, density and margin move and size the text", async () => {
    const base = await mapOf(SAMPLE);
    const big = await change((d) => (d.metadata.fontSize = 14));
    expect(at(big.boxes, "basics.name").height).toBeGreaterThan(at(base.boxes, "basics.name").height);
    const compact = await change((d) => (d.metadata.density = "compact"));
    expect(at(compact.boxes, "section:education").y).toBeLessThan(at(base.boxes, "section:education").y);
    const wide = await change((d) => (d.metadata.margin = 72));
    expect(at(wide.boxes, "basics.name").x).toBeGreaterThan(at(base.boxes, "basics.name").x);
  });

  it("the font pairing changes the width of the text", async () => {
    const base = await mapOf(SAMPLE);
    const mono = await change((d) => (d.metadata.font = "Courier"));
    expect(at(mono.boxes, "basics.headline").width).not.toBeCloseTo(at(base.boxes, "basics.headline").width, 0);
    const heading = await change((d) => (d.metadata.headingFont = "Times"));
    expect(at(heading.boxes, "basics.name").width).not.toBeCloseTo(at(base.boxes, "basics.name").width, 0);
  });

  it("the page size is A4, Letter or free-form", async () => {
    expect((await mapOf(SAMPLE)).sizes[0].width).toBeCloseTo(595.28, 1);
    expect((await change((d) => (d.metadata.pageSize = "LETTER"))).sizes[0]).toEqual({ width: 612, height: 792 });
    const free = await change((d) => Object.assign(d.metadata, { pageSize: "FREE", pageWidth: 500, pageHeight: 700 }));
    expect(free.sizes[0]).toEqual({ width: 500, height: 700 });
  });

  it("a section placed on page 2 is drawn on page 2, and the others stay on page 1", async () => {
    const { boxes, pages } = await change((d) => d.metadata.placements.push({ section: "education", column: "", page: 2 }));
    expect(pages).toBe(2);
    expect(at(boxes, "section:education").page).toBe(2);
    expect(at(boxes, "entry:edu-1:title").page).toBe(2);
    expect(at(boxes, "section:experience").page).toBe(1);
    expect(at(boxes, "section:skills").page).toBe(1);
  });

  it("a section placed in the sidebar is drawn beside the main column, on the chosen side and width", async () => {
    const sidebar = (edit: (d: Doc) => void) =>
      change((d) => {
        d.metadata.template = "sidebar";
        edit(d);
      });
    const moved = await sidebar((d) => d.metadata.placements.push({ section: "education", column: "side", page: 1 }));
    expect(at(moved.boxes, "section:education").x).toBeLessThan(at(moved.boxes, "section:experience").x);
    // Main on the left, when the sidebar is told to go right.
    const right = await sidebar((d) => (d.metadata.sidebarSide = "right"));
    expect(at(right.boxes, "section:skills").x).toBeGreaterThan(at(right.boxes, "section:experience").x);
    const narrow = await sidebar((d) => (d.metadata.sidebarWidth = 100));
    const normal = await sidebar(() => {});
    expect(at(narrow.boxes, "section:experience").x).toBeLessThan(at(normal.boxes, "section:experience").x);
  });

  it("two columns of entries put neighbours side by side", async () => {
    const one = await mapOf(SAMPLE);
    expect(at(one.boxes, "entry:skill-2:title").y).toBeGreaterThan(at(one.boxes, "entry:skill-1:title").y);
    const two = await change((d) => (d.metadata.entryColumns = 2));
    expect(at(two.boxes, "entry:skill-2:title").y).toBeCloseTo(at(two.boxes, "entry:skill-1:title").y, 0);
    expect(at(two.boxes, "entry:skill-2:title").x).toBeGreaterThan(at(two.boxes, "entry:skill-1:title").x);
  });

  it("a stacked entry header puts the dates under the title", async () => {
    const inline = await mapOf(SAMPLE);
    expect(at(inline.boxes, "entry:exp-1:dates").y).toBeCloseTo(at(inline.boxes, "entry:exp-1:title").y, 0);
    const stacked = await change((d) => (d.metadata.entryHeader = "stacked"));
    expect(at(stacked.boxes, "entry:exp-1:dates").y).toBeGreaterThan(at(stacked.boxes, "entry:exp-1:title").y);
  });
});
