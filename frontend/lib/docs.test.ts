import { describe, expect, it } from "vitest";

import { DOC_PAGES, groupDocPages, neighbours } from "./docs";

describe("neighbours", () => {
  it("has no previous page before the first one", () => {
    const { previous, next } = neighbours("/docs");
    expect(previous).toBeNull();
    expect(next?.href).toBe("/docs/mcp");
  });

  it("has no next page after the last one", () => {
    const { previous, next } = neighbours("/docs/mcp/troubleshooting");
    expect(previous?.href).toBe("/docs/mcp/limits");
    expect(next).toBeNull();
  });

  it("walks through the MCP pages in the sidebar's order", () => {
    expect(neighbours("/docs/mcp").next?.href).toBe("/docs/mcp/quick-start");
    expect(neighbours("/docs/mcp/connect").previous?.href).toBe("/docs/mcp/quick-start");
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
