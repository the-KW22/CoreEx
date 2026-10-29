import { describe, expect, it } from "vitest";

import { TAG_COLOURS, tagColour } from "./tag-colour";

describe("tagColour", () => {
  it("gives a Tag the same colour whatever its case, as Tag names ignore case", () => {
    expect(tagColour("Memory")).toBe(tagColour("memory"));
    expect(tagColour("CV")).toBe(tagColour("cv"));
  });

  it("always picks one of the 8 Tag colours, even for an empty or unusual name", () => {
    for (const name of ["", "a", "memory", "study", "日本語", "x".repeat(200)]) {
      expect(TAG_COLOURS).toContain(tagColour(name));
    }
  });

  it("spreads different names over more than one colour", () => {
    const names = ["memory", "study", "cv", "ideas", "reading", "work", "health", "travel"];
    expect(new Set(names.map(tagColour)).size).toBeGreaterThan(3);
  });
});
