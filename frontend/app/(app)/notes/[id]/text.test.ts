import { describe, expect, it } from "vitest";

import { firstLines, linkAt, wordCount } from "./text";

const ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("linkAt", () => {
  const text = `See [[${ID}|Plan]] and [[Ideas]].`;
  const start = text.indexOf("[[");

  it("finds the stored Link around a position, ends included", () => {
    expect(linkAt(text, start)).toEqual({ id: ID, from: start, to: start + `[[${ID}|Plan]]`.length });
    expect(linkAt(text, start + 10)?.id).toBe(ID);
    expect(linkAt(text, start + `[[${ID}|Plan]]`.length)?.id).toBe(ID);
  });

  it("is null outside a Link, and for a hand-typed title that has no id", () => {
    expect(linkAt(text, 1)).toBeNull();
    expect(linkAt(text, text.indexOf("[[Ideas") + 3)).toBeNull();
  });

  it("only looks at the line the position is on", () => {
    expect(linkAt(`[[${ID}|A]]\nplain`, `[[${ID}|A]]\n`.length + 2)).toBeNull();
  });
});

describe("wordCount", () => {
  it("counts words, a Link as the words of its text", () => {
    expect(wordCount(`Two words and [[${ID}|a Link]]`)).toBe(5);
  });

  it("ignores Markdown marks and is 0 for empty text", () => {
    expect(wordCount("# Title\n\n- **bold** _it_ `code`")).toBe(4);
    expect(wordCount("   \n ")).toBe(0);
  });
});

describe("firstLines", () => {
  it("gives the opening text as plain words, Links as their text", () => {
    expect(firstLines(`# Heading\n\nSome **text** with [[${ID}|a Link]].\n\nMore.`)).toBe(
      "Heading Some text with a Link. More.",
    );
  });

  it("cuts long text at a word and adds an ellipsis", () => {
    const out = firstLines("word ".repeat(100), 30);
    expect(out.length).toBeLessThanOrEqual(31);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});
