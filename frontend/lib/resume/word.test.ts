import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { SAMPLE } from "./sample";
import { resumeWord } from "./word";

describe("Word download", () => {
  it("keeps sample headings, formatting and lists without private notes", async () => {
    const blob = await resumeWord({ ...SAMPLE, privateNotes: "never share this" });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Alex Morgan");
    expect(xml).toContain("Experience");
    expect(xml).toContain("seven years");
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:numPr>");
    expect(xml).not.toContain("never share this");
  });

  it("keeps links and numbered lists", async () => {
    const blob = await resumeWord({ ...SAMPLE, summary: '<p><a href="https://example.com">Link</a><br>Next line</p><ol><li><p>First</p></li></ol>' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file("word/_rels/document.xml.rels")!.async("string")).toContain("https://example.com");
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:numPr>");
    expect(xml).toContain("<w:br/>");
  });
});
