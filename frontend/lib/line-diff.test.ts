import { describe, expect, it } from "vitest";

import { lineDiff } from "./line-diff";

describe("lineDiff", () => {
  it("marks identical text as all same", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("shows one changed line as removed then added", () => {
    expect(lineDiff("a\nold\nc", "a\nnew\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
      { kind: "same", text: "c" },
    ]);
  });

  it("shows a pure addition", () => {
    expect(lineDiff("a\nc", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("shows a pure deletion", () => {
    expect(lineDiff("a\nb\nc", "a\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("treats an empty before as all added", () => {
    expect(lineDiff("", "x\ny")).toEqual([
      { kind: "add", text: "x" },
      { kind: "add", text: "y" },
    ]);
  });

  it("treats an empty after as all removed", () => {
    expect(lineDiff("x\ny", "")).toEqual([
      { kind: "del", text: "x" },
      { kind: "del", text: "y" },
    ]);
  });

  it("treats CRLF like LF", () => {
    expect(lineDiff("a\r\nb", "a\nb").every((l) => l.kind === "same")).toBe(true);
  });

  it("shows a very long text as wholly replaced instead of building a huge table", () => {
    const before = Array.from({ length: 3000 }, (_, i) => `a${i}`).join("\n");
    const after = Array.from({ length: 3000 }, (_, i) => `b${i}`).join("\n");
    const lines = lineDiff(before, after);
    expect(lines).toHaveLength(6000);
    expect(lines[0].kind).toBe("del");
    expect(lines[5999].kind).toBe("add");
  });
});
