"use client";

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { useEffect, useMemo, useState } from "react";

import { nodeRadius, type GraphEdge, type Point } from "@/lib/graph";
import type { CanvasNode } from "@/lib/graph-tree";

type Placed = { id: string; r: number; x?: number; y?: number; fx?: number | null; fy?: number | null };

// Ticks run before the first paint, so the first fit is close to the final shape and the settling that follows is small.
const PRE_TICKS = 80;
// Without animation the simulation runs all the way to rest instead.
const REST_TICKS = 300;

// A stopped simulation. Nodes with a saved position (the Graph layout) are pinned there, the others settle around them.
function build(nodes: CanvasNode[], edges: GraphEdge[], toRest: boolean) {
  const placed: Placed[] = nodes.map((n) => ({
    id: n.id,
    r: nodeRadius(n.linkCount),
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

const positions = (placed: Placed[]) => new Map<string, Point>(placed.map((p) => [p.id, { x: p.x ?? 0, y: p.y ?? 0 }]));

// Where every node is, from a d3-force simulation that settles live, one tick per frame. With `reduceMotion` it is run
// to rest before the first paint and never moves on its own. `key` changes whenever the graph is laid out again.
export function useLayout(nodes: CanvasNode[], edges: GraphEdge[], reduceMotion: boolean) {
  const built = useMemo(() => build(nodes, edges, reduceMotion), [nodes, edges, reduceMotion]);
  const [state, setState] = useState(() => ({ built, pos: positions(built.placed) }));
  let pos = state.pos;
  if (state.built !== built) {
    pos = positions(built.placed);
    setState({ built, pos });
  }

  useEffect(() => {
    if (reduceMotion || built.placed.length === 0) return;
    built.sim.on("tick", () => setState({ built, pos: positions(built.placed) })).restart();
    return () => {
      built.sim.on("tick", null).stop();
    };
  }, [built, reduceMotion]);

  // Drags a node: it follows the pointer and, unless motion is reduced, the nodes around it follow it.
  function place(id: string, at: Point) {
    built.pin(id, at);
    if (reduceMotion) setState({ built, pos: positions(built.placed) });
    else built.sim.alpha(Math.max(built.sim.alpha(), 0.3)).restart();
  }

  return { key: built, pos, place };
}
