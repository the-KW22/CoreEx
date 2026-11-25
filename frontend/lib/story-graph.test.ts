import { describe, expect, it } from "vitest";

import { buildGraph, placeLabels } from "./story-graph";

describe("buildGraph", () => {
  const graph = buildGraph();
  it("makes about 60 Items in five clusters", () => {
    expect(graph.nodes).toHaveLength(60);
    expect(new Set(graph.nodes.map((n) => n.cluster)).size).toBe(5);
  });
  it("looks the same every time", () => {
    expect(JSON.stringify(buildGraph())).toBe(JSON.stringify(graph));
  });
  it("keeps every Item and every Link inside the frame and joins real Items", () => {
    for (const n of graph.nodes) for (const v of [...n.home, ...n.scatter]) expect(v >= 0 && v <= 1).toBe(true);
    for (const [a, b] of [...graph.links, graph.suggested]) {
      expect(graph.nodes[a]).toBeDefined();
      expect(graph.nodes[b]).toBeDefined();
    }
    expect(graph.links.length).toBeGreaterThan(55);
  });
  it("suggests a Link between Items that are not already linked", () => {
    const [a, b] = graph.suggested;
    expect(graph.links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))).toBe(false);
  });
});

describe("placeLabels", () => {
  const graph = buildGraph();
  it.each([[720, 470], [520, 340]])("keeps labels inside the frame and apart at %ix%i", (w, h) => {
    const labels = placeLabels(graph, w, h);
    expect(labels.length).toBeGreaterThan(2);
    for (const a of labels) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y - a.height).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(w);
      expect(a.y).toBeLessThanOrEqual(h);
      for (const b of labels) if (a !== b) expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y - a.height < b.y && b.y - b.height < a.y).toBe(false);
    }
  });
  it("leaves labels out on narrow screens", () => {
    expect(placeLabels(graph, 360, 250)).toEqual([]);
  });
});
