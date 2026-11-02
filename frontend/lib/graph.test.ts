import { describe, expect, it } from "vitest";

import { labelOpacity, linkMaps, nodeLabel, step, type GraphNode } from "./graph";

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
