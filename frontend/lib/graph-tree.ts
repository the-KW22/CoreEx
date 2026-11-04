import { childrenByParent, type Folder } from "./folders";
import { where, type GraphEdge, type GraphNode, type Point } from "./graph";

export type GraphMode = "links" | "tree";

// A Folder drawn in the Graph's Tree mode, beside the Items. `children` counts its subfolders and Items.
export type FolderNode = Omit<GraphNode, "type" | "folderId"> & { type: "FOLDER"; children: number; collapsed: boolean };
export type CanvasNode = GraphNode | FolderNode;

// The root's id when the tree is of All Items rather than one Folder.
export const ALL_ITEMS = "all-items";

// How close two neighbouring leaves may come, and the least distance between two rings.
const SPACING = 26;
const RING = 110;

type Branch = { node: CanvasNode; kids: Branch[]; leaves: number };

// The Tree mode's picture: the chosen Folder (or All Items) with its subfolders and Items below it, and nothing below a
// collapsed Folder. Radial, because its outer ring grows with the number of Items where a top-down tree would get very
// wide. Each node gets a slice of the circle in proportion to the leaves under it, so branches never cross.
export function treeGraph(folders: Folder[], items: GraphNode[], folderId: string | null, collapsed: Set<string>) {
  const subfolders = childrenByParent(folders);
  const itemsIn = new Map<string | null, GraphNode[]>();
  for (const item of items) {
    if (!item.stub) itemsIn.set(item.folderId, [...(itemsIn.get(item.folderId) ?? []), item]);
  }

  // `key` is the Folder's id, and null for All Items, which is what top-level things have as their parent.
  function branch(id: string, title: string, key: string | null): Branch {
    const inFolders = subfolders.get(key) ?? [];
    const inItems = itemsIn.get(key) ?? [];
    const children = inFolders.length + inItems.length;
    const shut = collapsed.has(id) && children > 0;
    const kids = shut
      ? []
      : [
          ...inFolders.map((f) => branch(f.id, f.name, f.id)),
          ...inItems.map((node) => ({ node, kids: [], leaves: 1 })),
        ];
    const node: FolderNode = { id, type: "FOLDER", title, folderPath: null, linkCount: 0, stub: false, x: null, y: null, children, collapsed: shut };
    return { node, kids, leaves: Math.max(1, kids.reduce((sum, kid) => sum + kid.leaves, 0)) };
  }

  const name = folderId ? (folders.find((f) => f.id === folderId)?.name ?? "This Folder") : "All Items";
  const root = branch(folderId ?? ALL_ITEMS, name, folderId);

  const nodes: CanvasNode[] = [];
  const edges: GraphEdge[] = [];
  // Where each node is with rings 1 apart, and the least room any leaf has along its ring.
  const unit = new Map<string, Point>();
  let room = 2 * Math.PI;
  function place(b: Branch, depth: number, angle: number, slice: number) {
    nodes.push(b.node);
    unit.set(b.node.id, { x: depth * Math.cos(angle), y: depth * Math.sin(angle) });
    if (!b.kids.length && depth > 0) room = Math.min(room, slice * depth);
    // Below the root a branch keeps to its half of the circle, or a lone Folder's children would wrap round the root.
    const span = depth === 0 ? slice : Math.min(slice, Math.PI);
    let from = angle - span / 2;
    for (const kid of b.kids) {
      const share = (span * kid.leaves) / b.leaves;
      edges.push({ source: b.node.id, target: kid.node.id });
      place(kid, depth + 1, from + share / 2, share);
      from += share;
    }
  }
  place(root, 0, 0, 2 * Math.PI);

  const ring = Math.max(RING, SPACING / room);
  const pos = new Map([...unit].map(([id, p]) => [id, { x: p.x * ring, y: p.y * ring }]));
  return { nodes, edges, pos };
}

// How a big vault opens: every Folder shut, except the one the graph starts at.
export const startCollapsed = (folders: Folder[], folderId: string | null) =>
  new Set(folders.map((f) => f.id).filter((id) => id !== folderId));

/** What a screen reader says for a node in Tree mode, such as "Work, Folder, 2 inside, collapsed". */
export function treeLabel(node: CanvasNode) {
  if (node.type !== "FOLDER") return `${node.title}, ${node.type === "NOTE" ? "Note" : "Asset"}, ${where(node)}`;
  if (node.children === 0) return `${node.title}, Folder, empty`;
  return `${node.title}, Folder, ${node.children} inside, ${node.collapsed ? "collapsed" : "expanded"}`;
}

export function graphHref(folderId: string | null, mode: GraphMode) {
  const query = new URLSearchParams();
  if (folderId) query.set("folderId", folderId);
  if (mode === "tree") query.set("mode", "tree");
  const text = query.toString();
  return text ? `/graph?${text}` : "/graph";
}
