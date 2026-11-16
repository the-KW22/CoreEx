import type { components } from "@/lib/api/schema";

import { tagColour, type TagColour } from "./tag-colour";

export type GraphNode = components["schemas"]["GraphNodeResponse"];
export type GraphEdge = components["schemas"]["GraphEdgeResponse"];
export type GraphTag = components["schemas"]["GraphTagResponse"];
export type SuggestedLink = components["schemas"]["SuggestedLinkResponse"];
export type Point = { x: number; y: number };

// Dots grow with their Links, but slowly, so a hub never swallows its neighbours.
export const nodeRadius = (linkCount: number) =>
  Math.min(5 + 2 * Math.sqrt(linkCount), 18);

/** For each Item: the Items it links to and the Notes that link to it. */
export function linkMaps(edges: GraphEdge[]) {
  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const { source, target } of edges) {
    out.set(source, [...(out.get(source) ?? []), target]);
    into.set(target, [...(into.get(target) ?? []), source]);
  }
  return { out, into };
}

// Labels fade in as the User zooms in: none at 1× and below, all the way from 1.5× up.
export const labelOpacity = (zoom: number) =>
  Math.min(Math.max((zoom - 1) / 0.5, 0), 1);

/** The word for a node's type, for labels and cards. */
export const typeName = (type: GraphNode["type"]) =>
  type === "NOTE" ? "Note" : type === "APPLICATION" ? "Application" : type === "RESUME" ? "Resume" : "Asset";

export const where = (node: GraphNode) =>
  node.folderPath ? `In ${node.folderPath}` : "Top level";

/** What a screen reader says for a node, such as "Energy, Note, links to 2: Sound, Atoms, linked from 1, Tags: physics". */
export function nodeLabel(
  node: GraphNode,
  titles: Map<string, string>,
  out: string[],
  into: string[],
  tagNames: string[] = [],
) {
  const kind = typeName(node.type);
  const names = out.map((id) => titles.get(id)).filter(Boolean);
  return [
    node.title,
    kind,
    ...(node.stub ? [where(node)] : []),
    `links to ${out.length}${names.length ? `: ${names.join(", ")}` : ""}`,
    `linked from ${into.length}`,
    ...(tagNames.length ? [`Tags: ${tagNames.join(", ")}`] : []),
  ].join(", ");
}

const DIRECTIONS = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 },
} as const;

export const isArrow = (key: string): key is keyof typeof DIRECTIONS =>
  key in DIRECTIONS;

/** The neighbour lying most nearly in the arrow's direction from `from`, or undefined when there is none that way. */
export function step(
  from: Point,
  key: keyof typeof DIRECTIONS,
  neighbours: { id: string; at: Point }[],
) {
  const dir = DIRECTIONS[key];
  let best: { id: string; cos: number } | undefined;
  for (const { id, at } of neighbours) {
    const dx = at.x - from.x;
    const dy = at.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const cos = (dx * dir.x + dy * dir.y) / length;
    if (cos > 0 && (!best || cos > best.cos)) best = { id, cos };
  }
  return best?.id;
}

// A failed graph request is "Page not found" only when a Folder was asked for and the API
// answered about it. A 404 without the API's own error `code` is a missing route (the backend
// is older than this frontend), and without a folderId nothing can be missing.
export function graphIsNotFound(
  status: number,
  folderId: string | null,
  error: unknown,
): boolean {
  if (!folderId) return false;
  if (status === 400) return true;
  return (
    status === 404 && (error as { code?: unknown } | null)?.code === "NOT_FOUND"
  );
}

export type View = { x: number; y: number; k: number };

export const clampZoom = (k: number) => Math.min(Math.max(k, 0.02), 4);

const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * The View after two fingers moved from `was` to `now`: zoomed by the change in their distance and panned by the change
 * of their midpoint, so what was under the fingers stays under them.
 */
export function pinchView(view: View, was: [Point, Point], now: [Point, Point]): View {
  const before = Math.hypot(was[0].x - was[1].x, was[0].y - was[1].y) || 1;
  const after = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
  const k = clampZoom((view.k * after) / before);
  const from = midpoint(...was);
  const to = midpoint(...now);
  return { k, x: to.x - ((from.x - view.x) * k) / view.k, y: to.y - ((from.y - view.y) * k) / view.k };
}

// The View that puts every node, unlinked ones included, inside a w × h box with `pad` pixels to spare.
export function fit(
  pos: Map<string, Point>,
  w: number,
  h: number,
  pad = 48,
): View {
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const k = Math.min(
    Math.max((w - 2 * pad) / (maxX - minX || 1), 0),
    Math.max((h - 2 * pad) / (maxY - minY || 1), 0),
    1.5,
  );
  return {
    k,
    x: w / 2 - ((minX + maxX) / 2) * k,
    y: h / 2 - ((minY + maxY) / 2) * k,
  };
}

// What narrows and colours the Graph, kept in the address so a view can be shared and reloaded.
export type GraphFilter = {
  tags: string[];
  type: "NOTE" | "ASSET" | "APPLICATION" | "RESUME" | null;
  linkedOnly: boolean;
  colour: "tag" | "folder" | null;
  similar: boolean;
};

export function readFilter(params: { getAll(name: string): string[]; get(name: string): string | null }): GraphFilter {
  const type = params.get("type");
  const colour = params.get("colour");
  return {
    tags: params.getAll("tag"),
    type: type === "NOTE" || type === "ASSET" || type === "APPLICATION" || type === "RESUME" ? type : null,
    linkedOnly: params.get("linked") === "1",
    colour: colour === "tag" || colour === "folder" ? colour : null,
    similar: params.get("similar") === "1",
  };
}

export function writeFilter(query: URLSearchParams, filter: GraphFilter) {
  for (const name of ["tag", "type", "linked", "colour", "similar"]) query.delete(name);
  for (const tag of filter.tags) query.append("tag", tag);
  if (filter.type) query.set("type", filter.type);
  if (filter.linkedOnly) query.set("linked", "1");
  if (filter.colour) query.set("colour", filter.colour);
  if (filter.similar) query.set("similar", "1");
}

/** Does this node pass the Tag and type filters? A Folder in Tree mode always does. */
export function matchesFilter(node: { type: string; tagIds: string[] }, filter: GraphFilter) {
  if (node.type === "FOLDER") return true;
  if (filter.type && node.type !== filter.type) return false;
  return filter.tags.length === 0 || node.tagIds.some((id) => filter.tags.includes(id));
}

/** The graph without stubs and without Items that have no Link to another Item once the stubs are gone. */
export function linkedOnly(nodes: GraphNode[], edges: GraphEdge[]) {
  const inside = new Set(nodes.filter((n) => !n.stub).map((n) => n.id));
  const kept = edges.filter((e) => inside.has(e.source) && inside.has(e.target));
  const linked = new Set(kept.flatMap((e) => [e.source, e.target]));
  return { nodes: nodes.filter((n) => linked.has(n.id)), edges: kept };
}

const LEGEND_SIZE = 8;

/**
 * Each node's colour and the legend for it. By Tag: the Tag with the most Items in this graph, so a cluster tends to
 * share a colour. By Folder: a colour from the Folder's path. Nodes with neither stay grey, and are in no legend entry.
 */
export function nodeColours(nodes: GraphNode[], tags: GraphTag[], mode: "tag" | "folder") {
  const groups = new Map<string, { name: string; colour: TagColour; count: number }>();
  const colours = new Map<string, TagColour>();
  const add = (key: string, name: string, colour: TagColour) => {
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { name, colour, count: 1 });
  };
  if (mode === "folder") {
    for (const n of nodes) {
      if (!n.folderPath) continue;
      const colour = tagColour(n.folderPath);
      colours.set(n.id, colour);
      add(n.folderPath, n.folderPath, colour);
    }
  } else {
    const byId = new Map(tags.map((t) => [t.id, t]));
    const uses = new Map<string, number>();
    for (const n of nodes) for (const id of n.tagIds) uses.set(id, (uses.get(id) ?? 0) + 1);
    for (const n of nodes) {
      const best = n.tagIds
        .map((id) => byId.get(id))
        .filter((t) => t !== undefined)
        .sort((a, b) => uses.get(b.id)! - uses.get(a.id)! || a.name.localeCompare(b.name))[0];
      if (!best) continue;
      const colour = best.colour ?? tagColour(best.name);
      colours.set(n.id, colour);
      add(best.id, best.name, colour);
    }
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { colours, legend: sorted.slice(0, LEGEND_SIZE), more: Math.max(0, sorted.length - LEGEND_SIZE) };
}

const HUBS = 5;
// shortcut: index and log pages are told by title alone, let a User leave out any Item if real vaults need more.
const NOT_A_HUB = /^(index|log)$/i;

/**
 * What people open a graph to find, among these nodes. Orphans have no Link to another Item in the graph, stubs not
 * counted. Hubs are the most linked. A group is two or more Items that Links join, named by its most linked.
 */
export function graphInsights(nodes: GraphNode[], edges: GraphEdge[]) {
  const inside = nodes.filter((n) => !n.stub);
  const parent = new Map(inside.map((n) => [n.id, n.id]));
  const root = (id: string): string => {
    let at = id;
    while (parent.get(at) !== at) at = parent.get(at)!;
    parent.set(id, at);
    return at;
  };
  const links = new Map<string, number>();
  const neighbours = new Map<string, string[]>();
  for (const { source, target } of edges) {
    if (!parent.has(source) || !parent.has(target)) continue;
    parent.set(root(source), root(target));
    for (const [from, to] of [[source, target], [target, source]]) {
      links.set(from, (links.get(from) ?? 0) + 1);
      neighbours.set(from, [...(neighbours.get(from) ?? []), to]);
    }
  }
  const count = (n: GraphNode) => links.get(n.id) ?? 0;
  const byLinks = (a: GraphNode, b: GraphNode) => count(b) - count(a) || a.title.localeCompare(b.title);

  const members = new Map<string, GraphNode[]>();
  for (const n of inside) members.set(root(n.id), [...(members.get(root(n.id)) ?? []), n]);

  return {
    orphans: inside.filter((n) => count(n) === 0).map((n) => n.id),
    hubs: inside
      .filter((n) => count(n) > 0 && !NOT_A_HUB.test(n.title))
      .sort(byLinks)
      .slice(0, HUBS)
      .map((n) => ({ id: n.id, title: n.title, links: count(n), ids: [n.id, ...(neighbours.get(n.id) ?? [])] })),
    groups: [...members.values()]
      .filter((group) => group.length > 1)
      .map((group) => ({ name: [...group].sort(byLinks)[0].title, ids: group.map((n) => n.id) }))
      .sort((a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name)),
  };
}

// How far in a found node is shown: close enough that its label and its neighbours' are readable.
const FOUND_ZOOM = 1.5;

/** The View with this point in the middle of a w × h box, at least as close as a found node needs. */
export const centreOn = (at: Point, w: number, h: number, current: number): View => {
  const k = Math.max(current, FOUND_ZOOM);
  return { k, x: w / 2 - at.x * k, y: h / 2 - at.y * k };
};

/** This Item and the Items linked to or from it. */
export function aroundNode(id: string, edges: GraphEdge[]) {
  const ids = new Set([id]);
  for (const { source, target } of edges) {
    if (source === id) ids.add(target);
    if (target === id) ids.add(source);
  }
  return [...ids];
}

/** The first few nodes whose title contains the text, ignoring case, the ones that start with it first. */
export function findNodes<T extends { title: string }>(nodes: T[], text: string, limit = 8) {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const starts = (n: T) => (n.title.toLowerCase().startsWith(q) ? 0 : 1);
  return nodes
    .filter((n) => n.title.toLowerCase().includes(q))
    .sort((a, b) => starts(a) - starts(b) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

// Roughly how much room a 12 px label takes, on screen.
const LABEL_CHAR = 6.6;
const LABEL_MAX_CHARS = 40;
const LABEL_HEIGHT = 16;

/**
 * Which nodes get a label: those on screen, biggest first, skipping any label that would land on one already placed.
 * The number drawn is then limited by the screen and not by the graph, so zooming in stays fast, and labels never collide.
 */
export function visibleLabels(
  nodes: { id: string; title: string; linkCount: number }[],
  pos: Map<string, Point>,
  view: View,
  w: number,
  h: number,
) {
  const shown = new Set<string>();
  const rows = new Map<number, { from: number; to: number }[]>();
  for (const n of [...nodes].sort((a, b) => b.linkCount - a.linkCount)) {
    const p = pos.get(n.id);
    if (!p) continue;
    const x = p.x * view.k + view.x;
    const y = p.y * view.k + view.y;
    const half = (Math.min(n.title.length, LABEL_MAX_CHARS) * LABEL_CHAR) / 2;
    if (x + half < 0 || x - half > w || y < 0 || y > h) continue;
    const row = Math.floor(y / LABEL_HEIGHT);
    const taken = [row - 1, row, row + 1].some((r) => rows.get(r)?.some((box) => x - half < box.to && x + half > box.from));
    if (taken) continue;
    rows.set(row, [...(rows.get(row) ?? []), { from: x - half, to: x + half }]);
    shown.add(n.id);
  }
  return shown;
}

/** For Items with no Links, the Items they are close to: the Suggested Links worth asking about. An orphan gets the Link. */
export function suggestionsForOrphans(orphans: string[], pairs: SuggestedLink[], limit = 2) {
  const lonely = new Set(orphans);
  const found = new Map<string, { id: string; title: string; closeTo: { id: string; title: string }[] }>();
  // Closest first, as the API sends them.
  for (const pair of pairs) {
    const ends = [
      { id: pair.source, title: pair.sourceTitle, other: { id: pair.target, title: pair.targetTitle } },
      { id: pair.target, title: pair.targetTitle, other: { id: pair.source, title: pair.sourceTitle } },
    ];
    for (const { id, title, other } of ends) {
      if (!lonely.has(id)) continue;
      const row = found.get(id) ?? { id, title, closeTo: [] };
      if (row.closeTo.length < limit) row.closeTo.push(other);
      found.set(id, row);
    }
  }
  return [...found.values()];
}
