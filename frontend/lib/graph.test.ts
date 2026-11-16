import { describe, expect, it } from "vitest";

import {
  aroundNode,
  centreOn,
  findNodes,
  fit,
  graphInsights,
  graphIsNotFound,
  labelOpacity,
  linkedOnly,
  linkMaps,
  matchesFilter,
  nodeColours,
  nodeLabel,
  pinchView,
  readFilter,
  step,
  typeName,
  suggestionsForOrphans,
  visibleLabels,
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

it("labels and filters Resume nodes", () => {
  expect(typeName("RESUME")).toBe("Resume");
  expect(readFilter(new URLSearchParams("type=RESUME")).type).toBe("RESUME");
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
  const none: GraphFilter = { tags: [], type: null, linkedOnly: false, colour: null, similar: false };

  it("survives the address, and ignores what it does not know", () => {
    const query = new URLSearchParams("folderId=f");
    const filter: GraphFilter = { tags: ["a", "b"], type: "ASSET", linkedOnly: true, colour: "folder", similar: true };
    writeFilter(query, filter);
    expect(query.get("folderId")).toBe("f");
    expect(readFilter(query)).toEqual(filter);
    expect(readFilter(new URLSearchParams("type=x&colour=y&linked=0"))).toEqual(none);
  });

  it("clears a filter from the address", () => {
    const query = new URLSearchParams("tag=a&type=NOTE&linked=1&colour=tag&similar=1&mode=tree");
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

describe("graphInsights", () => {
  const nodes = [
    node({ id: "hub", title: "Hub" }),
    node({ id: "a", title: "A" }),
    node({ id: "b", title: "B" }),
    node({ id: "x", title: "X" }),
    node({ id: "y", title: "Y" }),
    node({ id: "only-stub", title: "Only stub" }),
    node({ id: "lone", title: "Lone" }),
    node({ id: "stub", title: "Stub", stub: true }),
  ];
  const edges = [
    { source: "a", target: "hub" },
    { source: "b", target: "hub" },
    { source: "x", target: "y" },
    { source: "only-stub", target: "stub" },
  ];

  it("counts an Item linked only to a stub as an orphan, and never a stub itself", () => {
    expect(graphInsights(nodes, edges).orphans).toEqual(["only-stub", "lone"]);
  });

  it("finds the most linked, with what lights up around each", () => {
    const { hubs } = graphInsights(nodes, edges);
    expect(hubs[0]).toEqual({ id: "hub", title: "Hub", links: 2, ids: ["hub", "a", "b"] });
    expect(hubs.map((h) => h.title)).toEqual(["Hub", "A", "B", "X", "Y"]);
  });

  it("leaves index and log pages out of the most linked", () => {
    const { hubs } = graphInsights(
      [node({ id: "i", title: "Index" }), node({ id: "l", title: "log" }), node({ id: "n", title: "Note" })],
      [{ source: "i", target: "n" }, { source: "l", target: "n" }, { source: "i", target: "l" }],
    );
    expect(hubs.map((h) => h.title)).toEqual(["Note"]);
  });

  it("names each separate group after its most linked Item, biggest first", () => {
    const { groups } = graphInsights(nodes, edges);
    expect(groups.map((g) => [g.name, g.ids.length])).toEqual([["Hub", 3], ["X", 2]]);
  });

  it("does not join groups that only meet through a stub", () => {
    const { groups } = graphInsights(
      [node({ id: "a" }), node({ id: "b" }), node({ id: "c" }), node({ id: "d" }), node({ id: "s", stub: true })],
      [{ source: "a", target: "b" }, { source: "c", target: "d" }, { source: "a", target: "s" }, { source: "c", target: "s" }],
    );
    expect(groups).toHaveLength(2);
  });

  it("has nothing to say about an empty graph", () => {
    expect(graphInsights([], [])).toEqual({ orphans: [], hubs: [], groups: [] });
  });
});

describe("finding a node", () => {
  it("puts the node in the middle, zooming in only if it has to", () => {
    expect(centreOn({ x: 10, y: 20 }, 100, 200, 0.5)).toEqual({ k: 1.5, x: 35, y: 70 });
    expect(centreOn({ x: 10, y: 20 }, 100, 200, 3).k).toBe(3);
  });

  it("lights a node and what links either way, once each", () => {
    const edges = [{ source: "a", target: "b" }, { source: "c", target: "a" }, { source: "b", target: "a" }, { source: "c", target: "d" }];
    expect(aroundNode("a", edges)).toEqual(["a", "b", "c"]);
  });

  it("matches part of a title, ignoring case, the ones that start with it first", () => {
    const nodes = [{ title: "Nuclear energy" }, { title: "energy" }, { title: "Sound" }];
    expect(findNodes(nodes, " ENERGY ").map((n) => n.title)).toEqual(["energy", "Nuclear energy"]);
    expect(findNodes(nodes, "  ")).toEqual([]);
    expect(findNodes(nodes, "o", 1)).toHaveLength(1);
  });
});

describe("visibleLabels", () => {
  const view = { x: 0, y: 0, k: 1 };
  const labelled = (id: string, linkCount = 0) => ({ id, title: "Label", linkCount });

  it("leaves out what is off screen", () => {
    const pos = new Map([["in", { x: 100, y: 100 }], ["left", { x: -500, y: 100 }], ["below", { x: 100, y: 900 }]]);
    expect([...visibleLabels([labelled("in"), labelled("left"), labelled("below")], pos, view, 400, 400)]).toEqual(["in"]);
  });

  it("keeps the bigger node's label when two would overlap", () => {
    const pos = new Map([["small", { x: 100, y: 100 }], ["big", { x: 105, y: 102 }], ["apart", { x: 300, y: 100 }]]);
    const shown = visibleLabels([labelled("small", 1), labelled("big", 9), labelled("apart", 0)], pos, view, 400, 400);
    expect([...shown].sort()).toEqual(["apart", "big"]);
  });

  it("uses screen positions, so zooming in makes room", () => {
    const pos = new Map([["a", { x: 10, y: 10 }], ["b", { x: 12, y: 10 }]]);
    expect(visibleLabels([labelled("a"), labelled("b")], pos, view, 400, 400).size).toBe(1);
    expect(visibleLabels([labelled("a"), labelled("b")], pos, { x: 0, y: 0, k: 20 }, 400, 400).size).toBe(2);
  });

  it("copes with a node that has no place yet", () => {
    expect(visibleLabels([labelled("a")], new Map(), view, 400, 400).size).toBe(0);
  });
});

describe("pinchView", () => {
  const view = { x: 10, y: 20, k: 1 };

  it("zooms by the change in distance, keeping what is under the midpoint there", () => {
    const next = pinchView(view, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }]);
    expect(next.k).toBe(2);
    // World point under the midpoint (150, 100) before: (140, 80). It is still under the midpoint after.
    expect(140 * next.k + next.x).toBeCloseTo(150);
    expect(80 * next.k + next.y).toBeCloseTo(100);
  });

  it("pans by the change of the midpoint when the distance stays", () => {
    const next = pinchView(view, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 30, y: 40 }, { x: 130, y: 40 }]);
    expect(next).toEqual({ k: 1, x: 40, y: 60 });
  });

  it("stops at the zoom limits", () => {
    expect(pinchView(view, [{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 0, y: 0 }, { x: 1000, y: 0 }]).k).toBe(4);
  });

  it("survives two fingers starting on the same spot", () => {
    expect(Number.isFinite(pinchView(view, [{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 5 }, { x: 10, y: 5 }]).x)).toBe(true);
  });
});

describe("suggestionsForOrphans", () => {
  const pair = (source: string, target: string) => ({ source, sourceTitle: source.toUpperCase(), target, targetTitle: target.toUpperCase(), similarity: 0.9 });

  it("lists an orphan from either side of a pair, and skips pairs with no orphan", () => {
    const rows = suggestionsForOrphans(["o"], [pair("o", "a"), pair("b", "o"), pair("a", "b")]);
    expect(rows).toEqual([{ id: "o", title: "O", closeTo: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }]);
  });

  it("keeps to the closest few", () => {
    const rows = suggestionsForOrphans(["o"], [pair("o", "a"), pair("o", "b"), pair("o", "c")]);
    expect(rows[0].closeTo.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("lists both when two orphans are close", () => {
    expect(suggestionsForOrphans(["x", "y"], [pair("x", "y")]).map((r) => r.id)).toEqual(["x", "y"]);
  });
});
