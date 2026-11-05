"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { GraphEdge, Point } from "@/lib/graph";
import { build, type Placed } from "@/lib/graph-layout";
import type { CanvasNode } from "@/lib/graph-tree";

const positions = (placed: Placed[]) => new Map<string, Point>(placed.map((p) => [p.id, { x: p.x ?? 0, y: p.y ?? 0 }]));

// Where every node is, from a d3-force simulation that settles live, one tick per frame. With `reduceMotion` it is run
// to rest before the first paint and never moves on its own. `key` changes whenever the graph is laid out again.
export function useLayout(nodes: CanvasNode[], edges: GraphEdge[], reduceMotion: boolean) {
  const placedBefore = useRef<Map<string, Point>>(undefined);
  // eslint-disable-next-line react-hooks/refs -- only read when the nodes change, to start from where they were
  const built = useMemo(() => build(nodes, edges, reduceMotion, placedBefore.current), [nodes, edges, reduceMotion]);
  const [state, setState] = useState(() => ({ built, pos: positions(built.placed) }));
  let pos = state.pos;
  if (state.built !== built) {
    pos = positions(built.placed);
    setState({ built, pos });
  }

  useEffect(() => {
    placedBefore.current = pos;
  });

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
