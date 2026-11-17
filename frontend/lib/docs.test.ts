import { describe, expect, it } from "vitest";

import { DOC_PAGES, groupDocPages, neighbours } from "./docs";

describe("neighbours", () => {
  it("has no previous page before the first one", () => {
    const { previous, next } = neighbours("/docs");
    expect(previous).toBeNull();
    expect(next?.href).toBe("/docs/mcp");
  });

  it("has no next page after the last one", () => {
    const { previous, next } = neighbours("/docs/mcp");
    expect(previous?.href).toBe("/docs");
    expect(next).toBeNull();
  });

  it("ignores a trailing slash", () => {
    expect(neighbours("/docs/mcp/").previous?.href).toBe("/docs");
  });

  it("gives nothing for a page that is not in the list", () => {
    expect(neighbours("/docs/nowhere")).toEqual({ previous: null, next: null });
  });
});

describe("groupDocPages", () => {
  it("keeps the groups in the order their first page appears, with their pages in order", () => {
    const groups = groupDocPages(DOC_PAGES);
    expect(groups.map((g) => g.group)).toEqual(["Getting started", "MCP"]);
    expect(groups.flatMap((g) => g.pages)).toEqual(DOC_PAGES);
  });
});
