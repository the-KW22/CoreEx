import { describe, expect, it } from "vitest";

import {
  fit,
  graphIsNotFound,
  labelOpacity,
  linkedOnly,
  linkMaps,
  matchesFilter,
  nodeColours,
  nodeLabel,
  readFilter,
  step,
  writeFilter,
  type GraphFilter,
  type GraphNode,
} from "./graph";

const node = (over: Partial<GraphNode>): GraphNode => ({
  id: "a",
  type: "NOTE",
  title: "Energy",
  folderId: null,
  folderPath: null,
  linkCount: 0,
  stub: false,
  x: null,
  y: null,
  tagIds: [],
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

describe("the Graph filter", () => {
  const none: GraphFilter = { tags: [], type: null, linkedOnly: false, colour: null };

  it("survives the address, and ignores what it does not know", () => {
    const query = new URLSearchParams("folderId=f");
    const filter: GraphFilter = { tags: ["a", "b"], type: "ASSET", linkedOnly: true, colour: "folder" };
    writeFilter(query, filter);
    expect(query.get("folderId")).toBe("f");
    expect(readFilter(query)).toEqual(filter);
    expect(readFilter(new URLSearchParams("type=x&colour=y&linked=0"))).toEqual(none);
  });

  it("clears a filter from the address", () => {
    const query = new URLSearchParams("tag=a&type=NOTE&linked=1&colour=tag&mode=tree");
    writeFilter(query, none);
    expect(query.toString()).toBe("mode=tree");
  });

  it("matches any chosen Tag and the type, and always a Folder", () => {
    const tagged = { type: "NOTE", tagIds: ["a"] };
    expect(matchesFilter(tagged, none)).toBe(true);
    expect(matchesFilter(tagged, { ...none, tags: ["a", "b"] })).toBe(true);
    expect(matchesFilter(tagged, { ...none, tags: ["b"] })).toBe(false);
    expect(matchesFilter(tagged, { ...none, type: "ASSET" })).toBe(false);
    expect(matchesFilter({ type: "FOLDER", tagIds: [] }, { ...none, tags: ["b"], type: "NOTE" })).toBe(true);
  });

  it("counts a Link to a stub as no Link when hiding unlinked Items", () => {
    const nodes = [node({ id: "a" }), node({ id: "b" }), node({ id: "c" }), node({ id: "s", stub: true }), node({ id: "lone" })];
    const edges = [{ source: "a", target: "b" }, { source: "c", target: "s" }];
    const kept = linkedOnly(nodes, edges);
    expect(kept.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(kept.edges).toEqual([edges[0]]);
  });
});

describe("nodeColours", () => {
  const tags = [
    { id: "p", name: "physics", colour: "blue" as const },
    { id: "m", name: "maths", colour: "red" as const },
    { id: "z", name: "zoo", colour: null },
  ];

  it("gives an Item with several Tags the most-used one, ties by name", () => {
    const nodes = [
      node({ id: "1", tagIds: ["m", "p"] }),
      node({ id: "2", tagIds: ["p"] }),
      node({ id: "3", tagIds: ["z", "m"] }),
      node({ id: "4" }),
    ];
    const { colours, legend } = nodeColours(nodes, tags, "tag");
    // physics and maths tie on 2 uses, and maths comes first by name.
    expect(colours.get("1")).toBe("red");
    expect(colours.get("2")).toBe("blue");
    expect(colours.get("3")).toBe("red");
    expect(colours.has("4")).toBe(false);
    expect(legend.map((l) => [l.name, l.count])).toEqual([["maths", 2], ["physics", 1]]);
  });

  it("colours by Folder path, leaving the top level grey", () => {
    const { colours, legend } = nodeColours([node({ id: "1", folderPath: "Work" }), node({ id: "2", folderPath: "Work" }), node({ id: "3" })], [], "folder");
    expect(colours.get("1")).toBe(colours.get("2"));
    expect(colours.has("3")).toBe(false);
    expect(legend).toEqual([{ name: "Work", colour: colours.get("1"), count: 2 }]);
  });

  it("keeps the legend small and says how many more", () => {
    const many = Array.from({ length: 10 }, (_, i) => node({ id: `${i}`, folderPath: `F${i}` }));
    const { legend, more } = nodeColours(many, [], "folder");
    expect(legend).toHaveLength(8);
    expect(more).toBe(2);
  });
});
