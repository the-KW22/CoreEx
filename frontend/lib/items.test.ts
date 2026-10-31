import { describe, expect, it } from "vitest";

import { listHref, parseType } from "./items";

describe("parseType", () => {
  it("accepts the two types and nothing else", () => {
    expect(parseType("NOTE")).toBe("NOTE");
    expect(parseType("ASSET")).toBe("ASSET");
    expect(parseType("note")).toBeUndefined();
    expect(parseType(["NOTE", "ASSET"])).toBeUndefined();
    expect(parseType(undefined)).toBeUndefined();
  });
});

describe("listHref", () => {
  it("keeps the type when paging and leaves out the defaults", () => {
    expect(listHref("/items", 0)).toBe("/items");
    expect(listHref("/items", 2)).toBe("/items?page=2");
    expect(listHref("/items", 0, "NOTE")).toBe("/items?type=NOTE");
    expect(listHref("/folders/x", 1, "ASSET")).toBe("/folders/x?page=1&type=ASSET");
  });
});
