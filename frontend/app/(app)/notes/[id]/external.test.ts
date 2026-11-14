import { describe, expect, it } from "vitest";

import { changedNotice, externalChange } from "./external";

describe("externalChange", () => {
  it("does nothing while the stored version is the one the editor has", () => {
    expect(externalChange(3, { version: 3, unsaved: false })).toBe("none");
    expect(externalChange(3, { version: 3, unsaved: true })).toBe("none");
  });

  it("loads a newer version quietly when nothing is unsaved", () => {
    expect(externalChange(4, { version: 3, unsaved: false })).toBe("load");
  });

  it("opens a conflict when a newer version meets unsaved text", () => {
    expect(externalChange(4, { version: 3, unsaved: true })).toBe("conflict");
  });

  it("ignores an older stored version, such as a slow answer that arrives late", () => {
    expect(externalChange(2, { version: 3, unsaved: false })).toBe("none");
    expect(externalChange(2, { version: 3, unsaved: true })).toBe("none");
  });
});

describe("changedNotice", () => {
  it("names the Access token that made the change", () => {
    expect(changedNotice("Claude Code")).toBe("Changed by Claude Code just now.");
  });

  it("says another tab or device when the User made it", () => {
    expect(changedNotice(null)).toBe("Changed in another tab or device just now.");
  });
});
