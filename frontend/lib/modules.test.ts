import { describe, expect, it } from "vitest";

import { activeModule } from "./modules";

describe("activeModule", () => {
  it("marks Home only on the home page itself", () => {
    expect(activeModule("/")).toBe("home");
  });

  it("marks Trash and Admin on their pages and below", () => {
    expect(activeModule("/trash")).toBe("trash");
    expect(activeModule("/admin")).toBe("admin");
    expect(activeModule("/admin/users")).toBe("admin");
  });

  it("keeps Settings out of the Knowledge Base, so it has no panel", () => {
    expect(activeModule("/settings/tokens")).toBe("settings");
  });

  it("marks Docs on the Docs pages and below, so they have no panel", () => {
    expect(activeModule("/docs")).toBe("docs");
    expect(activeModule("/docs/mcp")).toBe("docs");
  });

  it("marks Assets on the Assets page and each Asset", () => {
    expect(activeModule("/assets")).toBe("assets");
    expect(activeModule("/assets/1")).toBe("assets");
  });

  it("keeps the Graph out of the Knowledge Base, so it has no panel", () => {
    expect(activeModule("/graph")).toBe("graph");
  });

  it("marks Career on its pages and every Application, so they have their own panel", () => {
    for (const path of ["/career", "/career/applications", "/career/applications/1"]) {
      expect(activeModule(path)).toBe("career");
    }
  });

  it("marks the Knowledge Base on every Item, Folder, Tag and Search page", () => {
    for (const path of ["/items", "/folders/1", "/tags", "/tags/1", "/notes/1", "/search"]) {
      expect(activeModule(path)).toBe("kb");
    }
  });

  it("does not mistake a longer name for a module", () => {
    expect(activeModule("/trashy")).toBe("kb");
    expect(activeModule("/docsy")).toBe("kb");
  });
});
