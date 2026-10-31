import { describe, expect, it } from "vitest";

import { parseCollapsed, parseView, withCollapsed } from "./prefs";

describe("parseView", () => {
  it("opens as a grid unless the list was chosen", () => {
    expect(parseView(undefined)).toBe("grid");
    expect(parseView("list")).toBe("list");
    expect(parseView("anything else")).toBe("grid");
  });
});

describe("collapsed sections", () => {
  it("reads a comma list, and nothing when there is no cookie", () => {
    expect([...parseCollapsed("folders,items")]).toEqual(["folders", "items"]);
    expect(parseCollapsed(undefined).size).toBe(0);
    expect(parseCollapsed("").size).toBe(0);
  });

  it("adds and removes one section without touching the others", () => {
    expect(withCollapsed(undefined, "items", true)).toBe("items");
    expect(withCollapsed("items", "folders", true)).toBe("items,folders");
    expect(withCollapsed("items,folders", "items", false)).toBe("folders");
    expect(withCollapsed("folders", "folders", true)).toBe("folders");
  });
});
