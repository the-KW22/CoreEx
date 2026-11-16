import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { resumeBlocks } from "./blocks";
import { parseRich } from "./html";
import { SAMPLE } from "./sample";
import { ResumePdf } from "./templates";

describe("reading the editor's HTML", () => {
  it("keeps bold, italic, underline, links, colour and alignment", () => {
    const rich = parseRich(
      '<p style="text-align: center"><strong>b</strong><em>i</em><u>u</u><span style="color: #ff0000">c</span><a href="https://x.example">l</a></p>',
    );
    expect(rich).toEqual([
      {
        kind: "paragraph",
        align: "center",
        runs: [
          { text: "b", bold: true },
          { text: "i", italic: true },
          { text: "u", underline: true },
          { text: "c", color: "#ff0000" },
          { text: "l", href: "https://x.example" },
        ],
      },
    ]);
  });

  it("reads lists, with the item text inside its paragraph", () => {
    expect(parseRich("<ul><li><p>one</p></li><li><p>two</p></li></ul><ol><li><p>first</p></li></ol>")).toEqual([
      { kind: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] },
      { kind: "list", ordered: true, items: [[{ text: "first" }]] },
    ]);
  });

  it("drops empty paragraphs and turns a line break into a newline", () => {
    expect(parseRich("<p></p><p> </p>")).toEqual([]);
    expect(parseRich("<p>a<br>b</p>")).toEqual([
      { kind: "paragraph", runs: [{ text: "a" }, { text: "\n" }, { text: "b" }] },
    ]);
  });
});

describe("what the template draws", () => {
  it("lists the sample Resume in reading order", () => {
    expect(resumeBlocks(SAMPLE)).toMatchSnapshot();
  });

  it("leaves out hidden sections and entries and sections with nothing to show", () => {
    const doc = structuredClone(SAMPLE);
    doc.sections[0].hidden = true;
    doc.sections[1].entries[0].hidden = true;
    const headings = resumeBlocks(doc).flatMap((b) => (b.kind === "heading" ? [b.text] : []));
    expect(headings).toEqual(["Summary", "Skills"]);
  });
});

describe("the PDF", () => {
  it("never holds the private notes", async () => {
    const doc = { ...structuredClone(SAMPLE), privateNotes: "sent-to-acme-on-monday" };
    expect(JSON.stringify(resumeBlocks(doc))).not.toContain("sent-to-acme");
    const bytes = new Uint8Array(await renderToBuffer(createElement(ResumePdf, { doc, fonts: { registered: false } }) as never));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loaded = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    const content = await (await loaded.getPage(1)).getTextContent();
    expect(content.items.map((i) => ("str" in i ? i.str : "")).join(" ")).not.toContain("sent-to-acme");
  });

  it("is a real PDF whose text can be selected, in reading order", async () => {
    const bytes = new Uint8Array(await renderToBuffer(createElement(ResumePdf, { doc: SAMPLE, fonts: { registered: false } }) as never));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loaded = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    expect(loaded.numPages).toBe(1);
    const content = await (await loaded.getPage(1)).getTextContent();
    // Headings are drawn in capitals, so compare without case.
    const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ").toLowerCase();
    expect(text).toContain("alex morgan");
    expect(text.indexOf("alex morgan")).toBeLessThan(text.indexOf("experience"));
    expect(text.indexOf("experience")).toBeLessThan(text.indexOf("education"));
    expect(text).toContain("led a team of five");
  });
});
