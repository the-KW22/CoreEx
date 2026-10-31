import { describe, expect, it } from "vitest";

import { firstLines, linkAt, wordCount, titleFromBody, withHeading } from "./text";

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

describe("titleFromBody", () => {
  it("is the text of a first-line heading, without the spaces around it", () => {
    expect(titleFromBody("# My Note\nbody")).toBe("My Note");
    expect(titleFromBody("#   Spaced  \nbody")).toBe("Spaced");
    expect(titleFromBody("# Only a heading")).toBe("Only a heading");
  });

  it("is empty for a heading with no words", () => {
    expect(titleFromBody("# \nbody")).toBe("");
  });

  it("is nothing when the first line is not a level 1 heading", () => {
    expect(titleFromBody("body\n# Later")).toBeNull();
    expect(titleFromBody("## Level two")).toBeNull();
    expect(titleFromBody("#hashtag")).toBeNull();
    expect(titleFromBody("")).toBeNull();
    expect(titleFromBody("```\n# in a fence")).toBeNull();
  });
});

describe("withHeading", () => {
  it("rewrites a first-line heading and keeps the rest", () => {
    expect(withHeading("# Old\nbody\n# Later", "New")).toBe("# New\nbody\n# Later");
    expect(withHeading("# Old", "New")).toBe("# New");
  });

  it("puts a heading in front when the first line is not one", () => {
    expect(withHeading("body", "Title")).toBe("# Title\nbody");
    expect(withHeading("## Level two\nx", "Title")).toBe("# Title\n## Level two\nx");
    expect(withHeading("", "Title")).toBe("# Title\n");
  });

  it("leaves the body alone when the title is empty", () => {
    expect(withHeading("# Old\nbody", "")).toBe("# Old\nbody");
    expect(withHeading("body", "   ")).toBe("body");
  });

  it("reads back as the same title", () => {
    expect(titleFromBody(withHeading("body", "  Round trip "))).toBe("Round trip");
  });
});
