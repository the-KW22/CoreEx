import { describe, expect, it } from "vitest";

import { fit, graphIsNotFound, labelOpacity, linkMaps, nodeLabel, step, type GraphNode } from "./graph";

const node = (over: Partial<GraphNode>): GraphNode => ({
  id: "a",
  type: "NOTE",
  title: "Energy",
  folderPath: null,
  linkCount: 0,
  stub: false,
  x: null,
  y: null,
  ...over,
});

describe("step", () => {
  const neighbours = [
    { id: "right", at: { x: 10, y: 1 } },
    { id: "up", at: { x: 1, y: -10 } },
    { id: "down-right", at: { x: 5, y: 5 } },
  ];

  it("picks the neighbour most nearly in the arrow's direction", () => {
    expect(step({ x: 0, y: 0 }, "ArrowRight", neighbours)).toBe("right");
    expect(step({ x: 0, y: 0 }, "ArrowUp", neighbours)).toBe("up");
    expect(step({ x: 0, y: 0 }, "ArrowDown", neighbours)).toBe("down-right");
  });

  it("finds nothing when no neighbour lies that way", () => {
    expect(step({ x: 0, y: 0 }, "ArrowLeft", neighbours)).toBeUndefined();
  });
});

describe("nodeLabel", () => {
  const titles = new Map([
    ["b", "Sound"],
    ["c", "Atoms"],
  ]);
  const { out, into } = linkMaps([
    { source: "a", target: "b" },
    { source: "a", target: "c" },
    { source: "c", target: "a" },
  ]);

  it("names the kind and the Items a node links to", () => {
    expect(nodeLabel(node({}), titles, out.get("a") ?? [], into.get("a") ?? [])).toBe(
      "Energy, Note, links to 2: Sound, Atoms, linked from 1",
    );
  });

  it("says where a stub lives", () => {
    expect(nodeLabel(node({ type: "ASSET", stub: true, folderPath: "Chemistry" }), titles, [], [])).toBe(
      "Energy, Asset, In Chemistry, links to 0, linked from 0",
    );
  });
});

describe("labelOpacity", () => {
  it("hides labels at 1× and below, shows them from 1.5× up, and fades in between", () => {
    expect(labelOpacity(0.5)).toBe(0);
    expect(labelOpacity(1)).toBe(0);
    expect(labelOpacity(1.25)).toBeCloseTo(0.5);
    expect(labelOpacity(1.5)).toBe(1);
    expect(labelOpacity(4)).toBe(1);
  });
});

describe("graphIsNotFound", () => {
  const notFound = { code: "NOT_FOUND" };
  it("is true for a bad or missing Folder", () => {
    expect(graphIsNotFound(404, "f1", notFound)).toBe(true);
    expect(graphIsNotFound(400, "f1", { code: "INVALID_REQUEST" })).toBe(true);
  });
  it("is false for All Items, whatever the status", () => {
    expect(graphIsNotFound(404, null, notFound)).toBe(false);
    expect(graphIsNotFound(404, null, undefined)).toBe(false);
  });
  it("is false for a 404 that is not the API's own error, such as a missing route", () => {
    expect(graphIsNotFound(404, "f1", { status: 404, error: "Not Found" })).toBe(false);
    expect(graphIsNotFound(404, "f1", undefined)).toBe(false);
  });
});

describe("fit", () => {
  it("puts every node inside the box with padding, even a far-off one", () => {
    const pos = new Map([["a", { x: 0, y: 0 }], ["b", { x: 4000, y: 100 }], ["c", { x: -50, y: 900 }]]);
    const { k, x, y } = fit(pos, 800, 500);
    for (const p of pos.values()) {
      expect(p.x * k + x).toBeGreaterThanOrEqual(48 - 0.001);
      expect(p.x * k + x).toBeLessThanOrEqual(752.001);
      expect(p.y * k + y).toBeGreaterThanOrEqual(48 - 0.001);
      expect(p.y * k + y).toBeLessThanOrEqual(452.001);
    }
  });
  it("centres a single node without growing past 1.5x", () => {
    expect(fit(new Map([["a", { x: 10, y: 10 }]]), 400, 300)).toEqual({ k: 1.5, x: 185, y: 135 });
  });
});
