import { describe, expect, it } from "vitest";

import type { Folder } from "./folders";
import type { GraphNode } from "./graph";
import { ALL_ITEMS, graphHref, startCollapsed, treeGraph, treeLabel, type FolderNode } from "./graph-tree";

const folder = (id: string, parentId: string | null = null) => ({ id, name: id.toUpperCase(), parentId, itemCount: 0 }) as Folder;
const item = (id: string, folderId: string | null, over: Partial<GraphNode> = {}): GraphNode => ({
  id,
  type: "NOTE",
  title: id,
  folderId,
  folderPath: folderId,
  linkCount: 0,
  stub: false,
  x: null,
  y: null,
  tagIds: [],
  ...over,
});

const folders = [folder("work"), folder("code", "work"), folder("home")];
const items = [item("top", null), item("plan", "work"), item("bug", "code"), item("milk", "home")];
const ids = (tree: { nodes: { id: string }[] }) => tree.nodes.map((n) => n.id).sort();
const edge = (source: string, target: string) => ({ source, target });
const none = new Set<string>();

describe("treeGraph", () => {
  it("joins All Items, Folders, subfolders and Items into one tree", () => {
    const tree = treeGraph(folders, items, null, none);

    expect(ids(tree)).toEqual([ALL_ITEMS, "bug", "code", "home", "milk", "plan", "top", "work"].sort());
    expect(tree.edges).toEqual(
      expect.arrayContaining([edge(ALL_ITEMS, "work"), edge(ALL_ITEMS, "top"), edge("work", "code"), edge("code", "bug")]),
    );
    expect(tree.edges).toHaveLength(tree.nodes.length - 1);
    expect(tree.nodes.find((n) => n.id === "work")).toMatchObject({ type: "FOLDER", title: "WORK", children: 2 });
  });

  it("starts at the chosen Folder, and leaves out Items from outside it", () => {
    const stub = item("elsewhere", "home", { stub: true });
    const tree = treeGraph(folders, [...items, stub], "work", none);

    expect(ids(tree)).toEqual(["bug", "code", "plan", "work"]);
    expect(tree.nodes.find((n) => n.id === "work")).toMatchObject({ title: "WORK" });
  });

  it("leaves a stub out even when its Folder is inside the tree", () => {
    expect(ids(treeGraph(folders, [item("linked", "work", { stub: true })], "work", none))).not.toContain("linked");
  });

  it("hides what is under a collapsed Folder and counts it", () => {
    const tree = treeGraph(folders, items, null, new Set(["work"]));

    expect(ids(tree)).not.toContain("plan");
    expect(ids(tree)).not.toContain("code");
    expect(tree.edges.some((e) => e.source === "work")).toBe(false);
    expect(tree.nodes.find((n) => n.id === "work")).toMatchObject({ collapsed: true, children: 2 });
    expect(tree.nodes.find((n) => n.id === "home")).toMatchObject({ collapsed: false, children: 1 });
  });

  it("shows an empty Folder as a Folder with no children", () => {
    const tree = treeGraph([folder("empty")], [], null, new Set(["empty"]));

    expect(tree.nodes.find((n) => n.id === "empty")).toMatchObject({ children: 0, collapsed: false });
  });

  it("counts a Folder's Items even when the graph, cut at its cap, does not hold them", () => {
    const tree = treeGraph([{ ...folder("big"), itemCount: 300 }], [], null, new Set(["big"]));

    expect(tree.nodes.find((n) => n.id === "big")).toMatchObject({ children: 300, collapsed: true });
  });

  it("gives every node a place, the root in the middle and each depth further out", () => {
    const { pos } = treeGraph(folders, items, null, none);
    const distance = (id: string) => Math.hypot(pos.get(id)!.x, pos.get(id)!.y);

    expect(distance(ALL_ITEMS)).toBe(0);
    expect(distance("work")).toBeGreaterThan(0);
    expect(distance("code")).toBeCloseTo(distance("work") * 2);
    expect(distance("bug")).toBeCloseTo(distance("work") * 3);
  });

  it("keeps Items apart however many there are, even when they all sit in one Folder", () => {
    const many = Array.from({ length: 400 }, (_, i) => item(`n${i}`, "work"));
    const { pos } = treeGraph([folder("work")], many, null, none);
    const points = many.map((n) => pos.get(n.id)!);
    const closest = Math.min(...points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y)));

    expect(closest).toBeGreaterThan(14);
  });
});

describe("startCollapsed", () => {
  it("collapses every Folder but the one the graph starts at", () => {
    expect([...startCollapsed(folders, null)].sort()).toEqual(["code", "home", "work"]);
    expect([...startCollapsed(folders, "work")].sort()).toEqual(["code", "home"]);
  });
});

describe("treeLabel", () => {
  const base = { id: "w", type: "FOLDER", title: "Work", folderPath: null, linkCount: 0, stub: false, x: null, y: null, tagIds: [] as string[] } as const;

  it("names a Folder, what it holds and whether it is open", () => {
    expect(treeLabel({ ...base, children: 2, collapsed: true } satisfies FolderNode)).toBe("Work, Folder, 2 inside, collapsed");
    expect(treeLabel({ ...base, children: 2, collapsed: false } satisfies FolderNode)).toBe("Work, Folder, 2 inside, expanded");
    expect(treeLabel({ ...base, children: 0, collapsed: false } satisfies FolderNode)).toBe("Work, Folder, empty");
  });

  it("names an Item, its kind and where it is", () => {
    expect(treeLabel(item("plan", "Work"))).toBe("plan, Note, In Work");
    expect(treeLabel(item("top", null, { type: "ASSET" }))).toBe("top, Asset, Top level");
  });
});

describe("graphHref", () => {
  it("keeps the Folder and the mode, and leaves the defaults out", () => {
    expect(graphHref(null, "links")).toBe("/graph");
    expect(graphHref("f1", "links")).toBe("/graph?folderId=f1");
    expect(graphHref(null, "tree")).toBe("/graph?mode=tree");
    expect(graphHref("f1", "tree")).toBe("/graph?folderId=f1&mode=tree");
  });
});
