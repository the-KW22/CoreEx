import { describe, expect, it } from "vitest";

import type { GraphNode } from "./graph";
import { build } from "./graph-layout";

const node = (id: string): GraphNode => ({ id, type: "NOTE", title: id, folderId: null, folderPath: null, linkCount: 1, stub: false, x: null, y: null, tagIds: [] });

describe("the layout when nodes are added", () => {
  const nodes = ["a", "b", "c", "d"].map(node);
  const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }, { source: "c", target: "d" }];
  const where = (placed: { id: string; x?: number; y?: number }[], id: string) => {
    const p = placed.find((n) => n.id === id)!;
    return { x: p.x!, y: p.y! };
  };
  const before = new Map(build(nodes, edges, true).placed.map((p) => [p.id, { x: p.x!, y: p.y! }]));

  it("keeps the graph where it was and puts a new node near what it links to", () => {
    const grown = build([...nodes, node("new")], [...edges, { source: "a", target: "new" }], true, before).placed;
    const moved = Math.hypot(where(grown, "d").x - before.get("d")!.x, where(grown, "d").y - before.get("d")!.y);
    const gap = Math.hypot(where(grown, "new").x - where(grown, "a").x, where(grown, "new").y - where(grown, "a").y);
    expect(moved).toBeLessThan(120);
    expect(gap).toBeLessThan(150);
  });

  it("lays out afresh when nodes were removed or replaced, as after Reset layout", () => {
    const fresh = build(nodes, edges, true).placed;
    const again = build(nodes, edges, true, before).placed;
    expect(where(again, "a")).toEqual(where(fresh, "a"));
  });
});
