import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";

import { nodeRadius, type GraphEdge, type Point } from "./graph";
import type { CanvasNode } from "./graph-tree";

export type Placed = { id: string; r: number; x?: number; y?: number; fx?: number | null; fy?: number | null };

// Ticks run before the first paint, so the first fit is close to the final shape and the settling that follows is small.
const PRE_TICKS = 80;
// Without animation the simulation runs all the way to rest instead.
const REST_TICKS = 300;

// A gentle restart, for when nodes were added to a graph already on screen.
const ADDED_ALPHA = 0.3;

// A stopped simulation. Nodes with a saved position (the Graph layout) are pinned there, the others settle around them.
// With `before` (where the nodes were) and nodes only added, everything starts from there and new nodes start beside
// what they link to, so loading neighbours does not throw the graph about.
export function build(nodes: CanvasNode[], edges: GraphEdge[], toRest: boolean, before?: Map<string, Point>) {
  const grew = !!before && before.size > 0 && nodes.length > before.size && [...before.keys()].every((id) => nodes.some((n) => n.id === id));
  const beside = (id: string) => {
    const edge = edges.find((e) => (e.source === id && before!.has(e.target)) || (e.target === id && before!.has(e.source)));
    const at = edge && before!.get(edge.source === id ? edge.target : edge.source);
    return at && { x: at.x + 20 * Math.cos(id.charCodeAt(0)), y: at.y + 20 * Math.sin(id.charCodeAt(0)) };
  };
  const placed: Placed[] = nodes.map((n) => ({
    id: n.id,
    r: nodeRadius(n.linkCount),
    ...(grew ? (before!.get(n.id) ?? beside(n.id)) : {}),
    ...(n.x != null && n.y != null ? { x: n.x, y: n.y, fx: n.x, fy: n.y } : {}),
  }));
  const sim = forceSimulation(placed)
    .force("link", forceLink(edges.map((e) => ({ ...e }))).id((d) => (d as Placed).id).distance(70))
    .force("charge", forceManyBody().strength(-140))
    .force("collide", forceCollide<Placed>((d) => d.r + 6))
    // A gentle pull to the middle keeps Items without Links from drifting away.
    .force("x", forceX(0).strength(0.04))
    .force("y", forceY(0).strength(0.04))
    .stop();
  if (grew) sim.alpha(ADDED_ALPHA);
  sim.tick(toRest ? REST_TICKS : PRE_TICKS);
  const byId = new Map(placed.map((p) => [p.id, p]));
  return {
    sim,
    placed,
    /** Holds a node at a point, as when it is dragged. */
    pin(id: string, at: Point) {
      const p = byId.get(id);
      if (p) {
        p.x = p.fx = at.x;
        p.y = p.fy = at.y;
      }
    },
  };
}
