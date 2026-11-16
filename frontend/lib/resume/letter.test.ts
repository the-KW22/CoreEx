import { describe, expect, it } from "vitest";
import { letterForPdf, letterWords } from "./letter";
import { SAMPLE } from "./sample";

describe("Cover Letter rendering", () => {
  const letter = { recipient: "A & B", date: "2026-11-17", greeting: "Dear team,", body: "<p>Built <strong>software</strong>.</p>", signOff: "Thank you", sender: SAMPLE.basics, design: SAMPLE.metadata };
  it("keeps the letter fields as text and escapes markup in plain fields", () => {
    const doc = letterForPdf({ ...letter, recipient: "<img src=x>" });
    expect(doc.summary).toContain("&lt;img src=x&gt;");
    expect(doc.summary).toContain("<strong>software</strong>");
    expect(doc.basics.name).toBe(SAMPLE.basics.name);
  });
  it("counts words in the body rather than HTML tags", () => {
    expect(letterWords(letter)).toBe(2);
  });
});
