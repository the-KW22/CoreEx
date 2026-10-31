import { describe, expect, it } from "vitest";

import { matches } from "./filter";

describe("matches", () => {
  it("ignores case and the spaces around the typed text", () => {
    expect(matches("Research Plan", "  research ")).toBe(true);
  });

  it("matches inside the name, not only at its start", () => {
    expect(matches("Reading list", "list")).toBe(true);
  });

  it("matches everything when nothing is typed", () => {
    expect(matches("Anything", "")).toBe(true);
    expect(matches("Anything", "   ")).toBe(true);
  });

  it("does not match a different name", () => {
    expect(matches("Ideas", "plan")).toBe(false);
  });
});
