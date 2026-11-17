import { describe, expect, it } from "vitest";

import { countAnswer, overLimit } from "./answer-count";

describe("counting an answer", () => {
  it("a blank answer counts as zero", () => {
    expect(countAnswer("WORDS", " \n\t ")).toBe(0);
    expect(countAnswer("CHARS", "  ")).toBe(0);
  });

  it("words split on runs of spaces, newlines and tabs", () => {
    expect(countAnswer("WORDS", "one  two\nthree\t\tfour")).toBe(4);
  });

  it("characters count code points, so an emoji is one", () => {
    expect(countAnswer("CHARS", "\u{1F600}")).toBe(1);
    expect(countAnswer("CHARS", "h\u{1F600}y")).toBe(3);
  });

  it("surrounding whitespace is ignored", () => {
    expect(countAnswer("WORDS", "  hi there  \n")).toBe(2);
    expect(countAnswer("CHARS", "  ab  ")).toBe(2);
  });
});

describe("over a limit", () => {
  it("exactly at the limit is within", () => {
    expect(overLimit("WORDS", 2, "one two")).toBe(false);
    expect(overLimit("CHARS", 3, "abc")).toBe(false);
  });

  it("one over the limit is over", () => {
    expect(overLimit("WORDS", 1, "one two")).toBe(true);
    expect(overLimit("CHARS", 2, "abc")).toBe(true);
  });

  it("with no unit or no limit it is never over", () => {
    expect(overLimit(null, 1, "a b c d e f g")).toBe(false);
    expect(overLimit("WORDS", null, "a b c d e f g")).toBe(false);
    expect(overLimit("CHARS", null, "anything at all")).toBe(false);
  });
});
