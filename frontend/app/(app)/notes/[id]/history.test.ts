import { describe, expect, it } from "vitest";

import { restoreBlocker, writtenBy } from "./history";

describe("writtenBy", () => {
  it("names the Access token, or the User when there is none", () => {
    expect(writtenBy("Claude Code")).toBe("Claude Code");
    expect(writtenBy(null)).toBe("You");
  });
});

describe("restoreBlocker", () => {
  const idle = { conflict: false, saving: false, unsaved: false };

  it("lets a restore go ahead when everything is saved", () => {
    expect(restoreBlocker(idle)).toBeNull();
  });

  it("holds it back while a conflict is open, text is unsaved or a save is running", () => {
    expect(restoreBlocker({ ...idle, conflict: true })).toMatch(/conflict/);
    expect(restoreBlocker({ ...idle, unsaved: true })).toMatch(/not saved yet/);
    expect(restoreBlocker({ ...idle, saving: true })).toMatch(/not saved yet/);
  });
});
