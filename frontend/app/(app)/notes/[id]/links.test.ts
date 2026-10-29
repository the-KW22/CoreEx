import { describe, expect, it } from "vitest";

import { linkIds, plainTitle, readLink } from "./links";

const ID = "3F2504E0-4F89-41D3-9A0C-0305E82C3301";

describe("readLink", () => {
  it("reads a stored Link, lowercasing the id and keeping the written text", () => {
    expect(readLink(`${ID}|My note`)).toEqual({ id: ID.toLowerCase(), text: "My note" });
    expect(readLink(ID)).toEqual({ id: ID.toLowerCase(), text: "" });
  });

  it("reads anything else as a hand-typed title", () => {
    expect(readLink("  Meeting notes ")).toEqual({ title: "Meeting notes" });
  });

  it("ignores an empty Link", () => {
    expect(readLink("   ")).toBeNull();
  });
});

describe("linkIds", () => {
  it("lists each stored Link once, and skips hand-typed titles", () => {
    const text = `see [[${ID}|a]] and [[${ID}|again]] and [[Just a title]]`;
    expect(linkIds(text)).toEqual([ID.toLowerCase()]);
  });

  it("does not span lines or nest brackets", () => {
    expect(linkIds(`[[${ID}\n|x]]`)).toEqual([]);
  });
});

describe("plainTitle", () => {
  it("keeps brackets from ending a Link early", () => {
    expect(plainTitle("a [b] c")).toBe("a (b) c");
  });
});
