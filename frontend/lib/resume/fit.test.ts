import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { fitSteps, fitToPage, intendedPages, LIMITS, overflows } from "./fit";
import { SAMPLE } from "./sample";
import { ResumePdf } from "./templates";

type Doc = typeof SAMPLE;
const doc = (edit: (d: Doc) => void = () => {}) => {
  const d = structuredClone(SAMPLE);
  edit(d);
  return d;
};

describe("overflow", () => {
  it("a Resume means to have its page count, or the highest page a section sits on", () => {
    expect(intendedPages(doc())).toBe(1);
    expect(intendedPages(doc((d) => (d.metadata.pageCount = 2)))).toBe(2);
    expect(intendedPages(doc((d) => d.metadata.placements.push({ section: "x", column: "", page: 3 })))).toBe(3);
  });

  it("it overflows only when it prints on more pages than that", () => {
    expect(overflows(2, doc())).toBe(true);
    expect(overflows(1, doc())).toBe(false);
    expect(overflows(2, doc((d) => (d.metadata.pageCount = 2)))).toBe(false);
  });
});

describe("the tightening steps", () => {
  it("go gentlest first, each tighter than the last, and stop at the limits", () => {
    const steps = fitSteps(SAMPLE.metadata);
    expect(steps[0]).toEqual({ density: "compact" });
    expect(steps[1]).toMatchObject({ density: "compact", margin: 36 });
    const last = steps.at(-1)!;
    expect(last).toMatchObject({ density: "compact", margin: LIMITS.margin, fontSize: LIMITS.fontSize });
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].margin ?? 99).toBeLessThanOrEqual(steps[i - 1].margin ?? 99);
      expect(steps[i].fontSize ?? 99).toBeLessThanOrEqual(steps[i - 1].fontSize ?? 99);
    }
  });

  it("never loosen what is already tight", () => {
    const tight = { ...SAMPLE.metadata, density: "compact", margin: 24, fontSize: 8 };
    expect(fitSteps(tight)).toEqual([]);
    const small = fitSteps({ ...SAMPLE.metadata, margin: 30, fontSize: 9 });
    expect(small.every((s) => (s.margin ?? 30) <= 30 && (s.fontSize ?? 9) <= 9)).toBe(true);
  });
});

describe("Fit to page", () => {
  it("does nothing when the Resume already fits", async () => {
    const result = await fitToPage(doc(), async () => 1);
    expect(result).toEqual({ patch: {}, tried: 1 });
  });

  it("finds the gentlest step that fits, in few renders", async () => {
    const steps = fitSteps(SAMPLE.metadata);
    const first = 6;
    const result = await fitToPage(doc(), async (d) => {
      const at = steps.findIndex((s) => s.fontSize === d.metadata.fontSize && s.margin === d.metadata.margin && s.density === d.metadata.density);
      return at >= first ? 1 : 2;
    });
    expect(result?.patch).toEqual(steps[first]);
    expect(result!.tried).toBeLessThanOrEqual(Math.ceil(Math.log2(steps.length)) + 2);
  });

  it("says no, and tries only the tightest, when nothing fits", async () => {
    let calls = 0;
    const result = await fitToPage(doc(), async () => {
      calls++;
      return 2;
    });
    expect(result).toBeNull();
    expect(calls).toBe(2);
  });

  it("a Resume that means to have two pages is fitted to two", async () => {
    const result = await fitToPage(doc((d) => (d.metadata.pageCount = 2)), async () => 2);
    expect(result?.patch).toEqual({});
  });

  it("fits a real overflowing Resume within the limits, and the PDF really has fewer pages", async () => {
    const long = doc((d) => {
      d.sections[0].entries = Array.from({ length: 9 }, (_, i) => ({ ...d.sections[0].entries[0], id: `e${i}` }));
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pagesFor = async (d: Doc) => {
      const bytes = new Uint8Array(await renderToBuffer(createElement(ResumePdf, { doc: d, fonts: { registered: false } }) as never));
      return (await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise).numPages;
    };
    expect(await pagesFor(long)).toBeGreaterThan(1);
    const fit = await fitToPage(long, pagesFor);
    expect(fit).not.toBeNull();
    expect(fit!.patch.margin ?? 40).toBeGreaterThanOrEqual(LIMITS.margin);
    expect(fit!.patch.fontSize ?? 10).toBeGreaterThanOrEqual(LIMITS.fontSize);
    expect(await pagesFor({ ...long, metadata: { ...long.metadata, ...fit!.patch } })).toBe(1);
  });
});
