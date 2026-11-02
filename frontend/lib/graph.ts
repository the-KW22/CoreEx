import type { components } from "@/lib/api/schema";

export type GraphNode = components["schemas"]["GraphNodeResponse"];
export type GraphEdge = components["schemas"]["GraphEdgeResponse"];
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

export const where = (node: GraphNode) =>
  node.folderPath ? `In ${node.folderPath}` : "Top level";

/** What a screen reader says for a node, such as "Energy, Note, links to 2: Sound, Atoms, linked from 1". */
export function nodeLabel(
  node: GraphNode,
  titles: Map<string, string>,
  out: string[],
  into: string[],
) {
  const kind = node.type === "NOTE" ? "Note" : "Asset";
  const names = out.map((id) => titles.get(id)).filter(Boolean);
  return [
    node.title,
    kind,
    ...(node.stub ? [where(node)] : []),
    `links to ${out.length}${names.length ? `: ${names.join(", ")}` : ""}`,
    `linked from ${into.length}`,
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
