import { describe, expect, it } from "vitest";

import {
  RAIL_DEFAULT,
  RAIL_MAX,
  RAIL_MIN,
  RAIL_SNAP,
  RAIL_STEP,
  dragRail,
  formatRail,
  keyRail,
  parseCollapsed,
  parseRail,
  parseView,
  withCollapsed,
} from "./prefs";

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

describe("parseRail", () => {
  it("reads the width and whether the rail is collapsed", () => {
    expect(parseRail("240")).toEqual({ collapsed: false, width: 240 });
    expect(parseRail("collapsed:240")).toEqual({ collapsed: true, width: 240 });
  });

  it("keeps working with the values older versions saved", () => {
    expect(parseRail("expanded")).toEqual({ collapsed: false, width: RAIL_DEFAULT });
    expect(parseRail("collapsed")).toEqual({ collapsed: true, width: RAIL_DEFAULT });
  });

  it("falls back or clamps when the cookie is missing, broken or out of range", () => {
    expect(parseRail(undefined)).toEqual({ collapsed: false, width: RAIL_DEFAULT });
    expect(parseRail("nonsense")).toEqual({ collapsed: false, width: RAIL_DEFAULT });
    expect(parseRail("Infinity")).toEqual({ collapsed: false, width: RAIL_DEFAULT });
    expect(parseRail("99999")).toEqual({ collapsed: false, width: RAIL_MAX });
    expect(parseRail("1")).toEqual({ collapsed: false, width: RAIL_MIN });
  });

  it("reads back what formatRail writes", () => {
    for (const rail of [{ collapsed: false, width: 250 }, { collapsed: true, width: 300 }]) {
      expect(parseRail(formatRail(rail))).toEqual(rail);
    }
  });
});

describe("dragRail", () => {
  const start = { collapsed: false, width: 300 };

  it("follows the pointer between the limits, and cannot go outside them", () => {
    expect(dragRail(250, start)).toEqual({ collapsed: false, width: 250 });
    expect(dragRail(9999, start)).toEqual({ collapsed: false, width: RAIL_MAX });
    expect(dragRail(RAIL_MIN - 1, start)).toEqual({ collapsed: false, width: RAIL_MIN });
  });

  it("snaps shut past the halfway point and remembers the width from before the drag", () => {
    expect(dragRail(RAIL_SNAP - 1, start)).toEqual({ collapsed: true, width: 300 });
    expect(dragRail(RAIL_SNAP, start)).toEqual({ collapsed: false, width: RAIL_MIN });
  });

  it("dragged out from collapsed, opens at the last width until the pointer passes it", () => {
    const closed = { collapsed: true, width: 300 };
    expect(dragRail(RAIL_SNAP - 1, closed)).toEqual(closed);
    expect(dragRail(RAIL_SNAP, closed)).toEqual({ collapsed: false, width: 300 });
    expect(dragRail(310, closed)).toEqual({ collapsed: false, width: 310 });
  });
});

describe("keyRail", () => {
  const open = { collapsed: false, width: 240 };
  const closed = { collapsed: true, width: 240 };

  it("steps the width with the arrow keys, inside the limits", () => {
    expect(keyRail(open, "ArrowRight")).toEqual({ collapsed: false, width: 240 + RAIL_STEP });
    expect(keyRail(open, "ArrowLeft")).toEqual({ collapsed: false, width: 240 - RAIL_STEP });
    expect(keyRail({ collapsed: false, width: RAIL_MAX }, "ArrowRight")).toEqual({ collapsed: false, width: RAIL_MAX });
  });

  it("collapses from the minimum, and the width is still there when it opens again", () => {
    expect(keyRail({ collapsed: false, width: RAIL_MIN }, "ArrowLeft")).toEqual({ collapsed: true, width: RAIL_MIN });
    expect(keyRail(closed, "ArrowLeft")).toEqual(closed);
    expect(keyRail(closed, "ArrowRight")).toEqual(open);
  });

  it("goes to the limits with Home and End, and toggles with Enter", () => {
    expect(keyRail(closed, "Home")).toEqual({ collapsed: false, width: RAIL_MIN });
    expect(keyRail(open, "End")).toEqual({ collapsed: false, width: RAIL_MAX });
    expect(keyRail(open, "Enter")).toEqual(closed);
    expect(keyRail(closed, "Enter")).toEqual(open);
  });

  it("ignores every other key", () => {
    expect(keyRail(open, "a")).toBeNull();
  });
});
