"use client";

import { MinusIcon, PlusIcon, RotateCcwIcon, ScanIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { isArrow, labelOpacity, linkMaps, nodeLabel, nodeRadius, step, where, type GraphEdge, type GraphNode, type Point } from "@/lib/graph";
import { itemHref } from "@/lib/items";

import { useLayout } from "./use-layout";

type View = { x: number; y: number; k: number };
type Gesture = { kind: "pan"; from: Point; view: View } | { kind: "node"; id: string; moved: boolean };

const clampZoom = (k: number) => Math.min(Math.max(k, 0.2), 4);

// What animates when a node is hovered or focused: the dimming, and the Links turning Mint. The global reduced-motion
// rule in globals.css makes these instant.
const fade = "transition-[opacity,fill,stroke,stroke-opacity] duration-(--duration-base) ease-(--ease-out)";

// Class strings are fixed up front: this runs for every node and Link on every frame.
const LINK_ON = `stroke-link ${fade}`;
const LINK_OFF = `stroke-muted-foreground ${fade}`;
const NODE = `cursor-pointer outline-none ${fade}`;
const SHAPE = {
  stub: `fill-background stroke-muted-foreground ${fade}`,
  active: `fill-foreground ${fade}`,
  idle: `fill-muted-foreground ${fade}`,
};
// Labels have no transition: their opacity already follows the zoom, and they are only drawn while visible.
const LABEL = "pointer-events-none fill-foreground";

// The View that fits every node into a w × h box.
function fit(pos: Map<string, Point>, w: number, h: number): View {
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = clampZoom(Math.min(w / (maxX - minX + 120), h / (maxY - minY + 120), 1.5));
  return { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k };
}

// The picture of a graph that the Graph page and an Item's Connections share: pan, zoom, hover cards, keyboard, and
// dragging nodes. `onDrop` saves where a node was left and `onReset` adds Reset layout; the local graph has neither.
export function GraphCanvas({
  nodes,
  edges,
  label,
  className,
  centre,
  onDrop,
  onReset,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The canvas's accessible name. */
  label: string;
  /** The panel's size. */
  className: string;
  /** The open Item, drawn larger. */
  centre?: string;
  onDrop?: (id: string, x: number, y: number) => void;
  onReset?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const arrowId = useId();
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.title])), [nodes]);
  const { out, into } = useMemo(() => linkMaps(edges), [edges]);
  const names = useMemo(
    () => new Map(nodes.map((n) => [n.id, nodeLabel(n, titles, out.get(n.id) ?? [], into.get(n.id) ?? [])])),
    [nodes, titles, out, into],
  );
  const reduceMotion = !!useReducedMotion();
  const layout = useLayout(nodes, edges, reduceMotion);
  const pos = layout.pos;
  const [size, setSize] = useState<{ w: number; h: number }>();
  const [view, setView] = useState<View>();
  const [refit, setRefit] = useState(false);
  // A server action refreshes the page with new data (lib/refresh.ts), which lays the graph out again.
  const [laidOut, setLaidOut] = useState(layout.key);
  if (laidOut !== layout.key) {
    setLaidOut(layout.key);
    // After Reset layout, show the fresh layout whole. A local graph has no saved layout, so it always does.
    if ((refit || !onReset) && size) {
      setRefit(false);
      setView(fit(pos, size.w, size.h));
    }
  }
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const gesture = useRef<Gesture | null>(null);

  const neighboursOf = (id: string) => [...(out.get(id) ?? []), ...(into.get(id) ?? [])];
  const active = hovered ?? focused;
  const lit = active ? new Set([active, ...neighboursOf(active)]) : null;

  // The SVG's user units are its pixels, so text and strokes keep their size whatever the window.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setSize({ w, h });
      // The first time the graph has a size, fit it in.
      setView((v) => v ?? fit(pos, w, h));
    });
    observer.observe(svg);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the first fit reads pos
  }, []);

  // React's onWheel is passive, and zooming must stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Wheel events can outnumber frames, so they are added up and applied once per frame.
    let frame = 0;
    let wheel = 0;
    let at: Point = { x: 0, y: 0 };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      wheel += e.deltaY;
      frame ||= requestAnimationFrame(() => {
        zoomAt(at, Math.exp(-wheel * 0.0015));
        frame = 0;
        wheel = 0;
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(frame);
    };
  }, []);

  function zoomAt(at: Point, factor: number) {
    setView((v) => {
      if (!v) return v;
      const k = clampZoom(v.k * factor);
      return { k, x: at.x - ((at.x - v.x) * k) / v.k, y: at.y - ((at.y - v.y) * k) / v.k };
    });
  }

  function pointer(e: React.PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent, id?: string) {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    gesture.current = id ? { kind: "node", id, moved: false } : view ? { kind: "pan", from: pointer(e), view } : null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || !view) return;
    const at = pointer(e);
    if (g.kind === "pan") {
      setView({ ...g.view, x: g.view.x + at.x - g.from.x, y: g.view.y + at.y - g.from.y });
    } else {
      g.moved = true;
      layout.place(g.id, { x: (at.x - view.x) / view.k, y: (at.y - view.y) / view.k });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind !== "node") return;
    if (!g.moved) {
      router.push(itemHref(byId.get(g.id)!));
      return;
    }
    // From the pointer itself: the last move may not have rendered yet.
    const at = pointer(e);
    const x = (at.x - view!.x) / view!.k;
    const y = (at.y - view!.y) / view!.k;
    layout.place(g.id, { x, y });
    onDrop?.(g.id, x, y);
  }

  async function reset() {
    setRefit(true);
    if (!(await onReset!())) setRefit(false);
  }

  function onKeyDown(e: React.KeyboardEvent, node: GraphNode) {
    if (e.key === "Enter") {
      router.push(itemHref(node));
    } else if (isArrow(e.key)) {
      e.preventDefault();
      const from = pos.get(node.id)!;
      const next = step(from, e.key, neighboursOf(node.id).map((id) => ({ id, at: pos.get(id)! })));
      if (next) nodeRefs.current.get(next)?.focus();
    }
  }

  const radius = (n: GraphNode) => nodeRadius(n.linkCount) * (n.id === centre ? 1.5 : 1);
  const labels = view ? labelOpacity(view.k) : 0;
  const card = active && view ? byId.get(active) : undefined;
  const cardAt = card && view ? pos.get(card.id)! : undefined;

  return (
    <div className={`relative ${className} overflow-hidden rounded-[14px] border border-border bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[20px_20px]`}>
      <svg
        ref={svgRef}
        role="group"
        aria-label={label}
        className="size-full touch-none select-none"
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" className="fill-link" />
          </marker>
        </defs>
        {view && (
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {edges.map((e) => {
              const a = pos.get(e.source)!;
              const b = pos.get(e.target)!;
              const on = active !== null && (e.source === active || e.target === active);
              const stub = byId.get(e.source)!.stub || byId.get(e.target)!.stub;
              // End the line at the target's edge so its arrow stays visible.
              const gap = (radius(byId.get(e.target)!) + 3) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
              return (
                <line
                  key={`${e.source}-${e.target}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x - (b.x - a.x) * gap}
                  y2={b.y - (b.y - a.y) * gap}
                  className={on ? LINK_ON : LINK_OFF}
                  strokeWidth={(on ? 1.6 : 0.8) / view.k}
                  strokeDasharray={stub ? `${4 / view.k} ${4 / view.k}` : undefined}
                  style={{ strokeOpacity: on ? 1 : lit ? 0.12 : 0.35 }}
                  markerEnd={on ? `url(#${arrowId})` : undefined}
                />
              );
            })}
            {nodes.map((n) => {
              const p = pos.get(n.id)!;
              const r = radius(n);
              const dim = lit !== null && !lit.has(n.id);
              const shape = n.stub ? SHAPE.stub : n.id === active ? SHAPE.active : SHAPE.idle;
              const shapeProps = { className: shape, strokeWidth: 1.2 / view.k, strokeDasharray: n.stub ? `${3 / view.k} ${3 / view.k}` : undefined };
              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(n.id, el);
                    else nodeRefs.current.delete(n.id);
                  }}
                  role="link"
                  tabIndex={0}
                  aria-label={names.get(n.id)}
                  transform={`translate(${p.x} ${p.y})`}
                  className={`${NODE} ${dim ? "opacity-25" : "opacity-100"}`}
                  onPointerDown={(e) => onPointerDown(e, n.id)}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setFocused(n.id)}
                  onBlur={() => setFocused(null)}
                  onKeyDown={(e) => onKeyDown(e, n)}
                >
                  {focused === n.id && <circle r={r + 5 / view.k} className="fill-none stroke-ring" strokeWidth={2 / view.k} />}
                  {n.type === "NOTE" ? (
                    <circle r={r} {...shapeProps} />
                  ) : (
                    <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={r / 3} {...shapeProps} />
                  )}
                  {/* The node's name already says it all, so the label is only for the eye. */}
                  {(labels > 0 || lit?.has(n.id)) && (
                    <text
                      y={r + 14 / view.k}
                      textAnchor="middle"
                      aria-hidden
                      className={LABEL}
                      style={{ opacity: lit?.has(n.id) ? 1 : labels }}
                      fontSize={12 / view.k}
                    >
                      {n.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {card && cardAt && view && (
        <div
          aria-hidden
          className="pointer-events-none absolute grid w-max max-w-64 gap-0.5 rounded-[10px] border border-border bg-popover p-3 text-sm shadow-lg"
          style={{ left: cardAt.x * view.k + view.x + 16, top: cardAt.y * view.k + view.y + 16 }}
        >
          <p className="font-medium">{card.title}</p>
          <p className="text-muted-foreground">
            {card.type === "NOTE" ? "Note" : "Asset"} · {out.get(card.id)?.length ?? 0} Links ·{" "}
            {into.get(card.id)?.length ?? 0} Backlinks
          </p>
          {card.stub && <p className="text-muted-foreground">{where(card)}</p>}
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex gap-1">
        <Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => size && zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.25)}>
          <PlusIcon aria-hidden />
        </Button>
        <Button variant="outline" size="icon" aria-label="Zoom out" onClick={() => size && zoomAt({ x: size.w / 2, y: size.h / 2 }, 0.8)}>
          <MinusIcon aria-hidden />
        </Button>
        <Button variant="outline" size="icon" aria-label="Fit the graph" onClick={() => size && setView(fit(pos, size.w, size.h))}>
          <ScanIcon aria-hidden />
        </Button>
        {onReset && (
          <Button variant="outline" onClick={reset}>
            <RotateCcwIcon aria-hidden />
            Reset layout
          </Button>
        )}
      </div>
    </div>
  );
}
