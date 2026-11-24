import { describe, expect, it } from "vitest";

import { proposalMarks, sameText } from "./proposal-marks";

describe("proposalMarks", () => {
  it("marks nothing when the text is the same", () => {
    expect(proposalMarks("a\nb", "a\nb")).toEqual({ deleted: [], added: [] });
  });

  it("marks a changed line as removed, with the new line after it", () => {
    expect(proposalMarks("a\nold\nc", "a\nnew\nc")).toEqual({ deleted: [1], added: [{ after: 1, lines: ["new"] }] });
  });

  it("puts added lines after the line they follow", () => {
    expect(proposalMarks("a\nc", "a\nb\nb2\nc")).toEqual({ deleted: [], added: [{ after: 0, lines: ["b", "b2"] }] });
  });

  it("puts lines added at the start before the first line", () => {
    expect(proposalMarks("a", "x\na")).toEqual({ deleted: [], added: [{ after: -1, lines: ["x"] }] });
  });

  it("marks a removed line", () => {
    expect(proposalMarks("a\nb\nc", "a\nc")).toEqual({ deleted: [1], added: [] });
  });

  it("adds everything to an empty text", () => {
    expect(proposalMarks("", "x\ny")).toEqual({ deleted: [], added: [{ after: -1, lines: ["x", "y"] }] });
  });
});

describe("sameText", () => {
  it("treats CRLF like LF", () => {
    expect(sameText("a\r\nb", "a\nb")).toBe(true);
    expect(sameText("a\nb", "a\nc")).toBe(false);
  });
});
