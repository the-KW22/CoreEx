"use client";

import { MaximizeIcon, MinimizeIcon, MinusIcon, PlusIcon, RotateCcwIcon, ScanIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { centreOn, clampZoom, fit, isArrow, labelOpacity, linkMaps, nodeLabel, nodeRadius, pinchView, step, visibleLabels, where, type GraphEdge, type Point, type View } from "@/lib/graph";
import { treeLabel, type CanvasNode } from "@/lib/graph-tree";
import { itemHref } from "@/lib/items";
import type { TagColour } from "@/lib/tag-colour";

import { useLayout } from "./use-layout";

type Gesture =
  | { kind: "pan"; from: Point; view: View }
  | { kind: "node"; id: string; from: Point; moved: boolean; held: boolean }
  | { kind: "pinch"; was: [Point, Point]; view: View };

const LONG_PRESS_MS = 500;
// A finger never holds quite still, so a tap may wander this far and still be a tap.
const TAP_SLOP = 6;

const PAN_MS = 300;

// What animates when a node is hovered or focused: the dimming, and the Links turning Mint. The global reduced-motion
// rule in globals.css makes these instant.
const fade = "transition-[opacity,fill,stroke,stroke-opacity] duration-(--duration-base) ease-(--ease-out)";

// Class strings are fixed up front: this runs for every node and Link on every frame.
const LINK_ON = `stroke-link ${fade}`;
const LINK_OFF = `stroke-muted-foreground ${fade}`;
const NODE = `cursor-pointer outline-none ${fade}`;
const SHAPE = {
  stub: `fill-background stroke-muted-foreground ${fade}`,
  stubColoured: `fill-background stroke-(--tag) ${fade}`,
  active: `fill-foreground ${fade}`,
  idle: `fill-muted-foreground ${fade}`,
  coloured: `fill-(--tag) ${fade}`,
};
// Labels have no transition: their opacity already follows the zoom, and they are only drawn while visible.
const LABEL = "pointer-events-none fill-foreground";

const FOLDER_RADIUS = 11;
// The shape only Folders have.
const hexagon = (r: number) =>
  [0, 1, 2, 3, 4, 5].map((i) => `${r * Math.cos((i * Math.PI) / 3)},${r * Math.sin((i * Math.PI) / 3)}`).join(" ");
// The simulation gets these in Tree mode, where the positions come from the tree.
const NO_NODES: CanvasNode[] = [];
const NO_EDGES: GraphEdge[] = [];

// The picture of a graph that the Graph page and an Item's Connections share: pan, zoom, hover cards, keyboard, and
// dragging nodes. `onDrop` saves where a node was left and `onReset` adds Reset layout; the local graph has neither.
// `tree` is the Tree mode: its nodes stay where the tree puts them, and a Folder opens or shuts instead of being a link.
export function GraphCanvas({
  nodes,
  edges,
  label,
  className,
  centre,
  onDrop,
  onReset,
  tree,
  dimmed,
  colours,
  tagNames,
  legend,
  highlight,
  focusOn,
  onBackgroundClick,
  expand,
}: {
  nodes: CanvasNode[];
  edges: GraphEdge[];
  /** The canvas's accessible name. */
  label: string;
  /** The panel's size. */
  className: string;
  /** The open Item, drawn larger. */
  centre?: string;
  onDrop?: (id: string, x: number, y: number) => void;
  onReset?: () => Promise<boolean>;
  tree?: { pos: Map<string, Point>; onToggle: (id: string) => void };
  /** Nodes a filter leaves out: faded, and still reachable by keyboard. */
  dimmed?: Set<string>;
  /** Node colours, from the Colour by control. Without one a node is grey. */
  colours?: Map<string, TagColour>;
  /** Each node's Tags, for its name and hover card, so a colour is never the only sign of one. */
  tagNames?: Map<string, string[]>;
  /** Drawn in the top-left corner, so it stays with the canvas at full screen. */
  legend?: React.ReactNode;
  /** Items to light up as a hovered node lights its neighbours, until hover or focus takes over. */
  highlight?: string[];
  /** A node to bring to the middle. A new object moves there again; `move` also puts keyboard focus on it. */
  focusOn?: { id: string; move: boolean } | null;
  /** The background was clicked rather than dragged. */
  onBackgroundClick?: () => void;
  /** Load its neighbours: offered for the node last hovered or focused, when `can` says there may be more. */
  expand?: { can: (id: string) => boolean; run: (id: string) => void; busy: boolean };
}) {
  const router = useRouter();
  const arrowId = useId();
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.title])), [nodes]);
  const { out, into } = useMemo(() => linkMaps(edges), [edges]);
  const names = useMemo(
    () =>
      new Map(
        nodes.map((n) => [
          n.id,
          tree || n.type === "FOLDER"
            ? treeLabel(n)
            : // A colour is never the only sign of the Folder it stands for.
              `${nodeLabel(n, titles, out.get(n.id) ?? [], into.get(n.id) ?? [], tagNames?.get(n.id))}${colours && !n.stub ? `, ${where(n)}` : ""}`,
        ]),
      ),
    [nodes, titles, out, into, tree, tagNames, colours],
  );
  const reduceMotion = !!useReducedMotion();
  const layout = useLayout(tree ? NO_NODES : nodes, tree ? NO_EDGES : edges, reduceMotion);
  const pos = tree?.pos ?? layout.pos;
  const layoutKey = tree?.pos ?? layout.key;
  const [size, setSize] = useState<{ w: number; h: number }>();
  const [view, setView] = useState<View>();
  const [refit, setRefit] = useState(false);
  // A server action refreshes the page with new data (lib/refresh.ts), which lays the graph out again.
  const [laidOut, setLaidOut] = useState<unknown>(layoutKey);
  if (laidOut !== layoutKey) {
    setLaidOut(layoutKey);
    // After Reset layout, show the fresh layout whole. A local graph has no saved layout, so it always does.
    if ((refit || !onReset) && size) {
      setRefit(false);
      setView(fit(pos, size.w, size.h));
    }
  }
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Stays after the pointer leaves, so the pointer can reach the button that acts on it.
  const [picked, setPicked] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refitOnResize = useRef(false);
  const [full, setFull] = useState(false);
  // shortcut: no fallback where an element cannot go full screen (iPhone Safari), add a fixed overlay if that matters.
  const canFull = useSyncExternalStore(
    () => () => {},
    () => document.fullscreenEnabled,
    () => false,
  );
  useEffect(() => {
    const onChange = () => {
      refitOnResize.current = true;
      setFull(document.fullscreenElement === panelRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const gesture = useRef<Gesture | null>(null);
  const fingers = useRef(new Map<number, Point>());
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The hover card has no hover on a touch screen: a long press shows it, until the background is tapped.
  const [pressed, setPressed] = useState<string | null>(null);

  const neighboursOf = (id: string) => [...(out.get(id) ?? []), ...(into.get(id) ?? [])];
  const active = hovered ?? focused ?? pressed;
  const lit = active ? new Set([active, ...neighboursOf(active)]) : highlight ? new Set(highlight) : null;

  // The SVG's user units are its pixels, so text and strokes keep their size whatever the window.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setSize({ w, h });
      // The first time the graph has a size, fit it in.
      setView((v) => (v && !refitOnResize.current ? v : fit(pos, w, h)));
      refitOnResize.current = false;
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

  // Pans to a found node once the canvas has a size. The layout may still be settling, so it reads the latest place.
  const latest = useRef({ pos, view });
  useEffect(() => {
    latest.current = { pos, view };
  });
  const sized = size !== undefined;
  useEffect(() => {
    if (!focusOn || !size) return;
    const at = latest.current.pos.get(focusOn.id);
    const from = latest.current.view;
    if (!at || !from) return;
    if (focusOn.move) nodeRefs.current.get(focusOn.id)?.focus({ preventScroll: true });
    const to = centreOn(at, size.w, size.h, from.k);
    if (reduceMotion) {
      setView(to);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / PAN_MS, 1);
      const ease = 1 - (1 - t) ** 3;
      setView({ k: from.k + (to.k - from.k) * ease, x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease });
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new focusOn, or the first size, moves the view
  }, [focusOn, sized]);

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
    const at = pointer(e);
    fingers.current.set(e.pointerId, at);
    clearTimeout(pressTimer.current);
    if (fingers.current.size === 2 && view) {
      gesture.current = { kind: "pinch", was: [...fingers.current.values()] as [Point, Point], view };
      return;
    }
    if (fingers.current.size > 2) return;
    if (id) {
      const g: Gesture = { kind: "node", id, from: at, moved: false, held: false };
      gesture.current = g;
      if (e.pointerType === "touch") {
        pressTimer.current = setTimeout(() => {
          g.held = true;
          setPressed(id);
          setPicked(id);
        }, LONG_PRESS_MS);
      }
    } else {
      gesture.current = view ? { kind: "pan", from: at, view } : null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || !view) return;
    const at = pointer(e);
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, at);
    if (g.kind === "pinch") {
      setView(pinchView(g.view, g.was, [...fingers.current.values()] as [Point, Point]));
    } else if (g.kind === "pan") {
      setView({ ...g.view, x: g.view.x + at.x - g.from.x, y: g.view.y + at.y - g.from.y });
    } else if (g.moved || Math.hypot(at.x - g.from.x, at.y - g.from.y) >= TAP_SLOP) {
      g.moved = true;
      clearTimeout(pressTimer.current);
      if (!tree) layout.place(g.id, { x: (at.x - view.x) / view.k, y: (at.y - view.y) / view.k });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    fingers.current.delete(e.pointerId);
    clearTimeout(pressTimer.current);
    if (g?.kind === "pinch") {
      // The finger left behind carries on as a pan from the View the pinch reached.
      const [left] = [...fingers.current.values()];
      gesture.current = left && view ? { kind: "pan", from: left, view } : null;
      return;
    }
    gesture.current = null;
    if (g?.kind === "pan") {
      const at = pointer(e);
      if (Math.hypot(at.x - g.from.x, at.y - g.from.y) < 4) {
        setPicked(null);
        setPressed(null);
        onBackgroundClick?.();
      }
    }
    if (g?.kind !== "node" || g.held || e.type === "pointercancel") return;
    if (!g.moved) {
      open(byId.get(g.id)!);
      return;
    }
    if (tree) return;
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

  function open(node: CanvasNode) {
    if (node.type === "FOLDER") tree?.onToggle(node.id);
    else router.push(itemHref(node));
  }

  function onKeyDown(e: React.KeyboardEvent, node: CanvasNode) {
    // A Folder is a button, and a button answers to Space as well.
    if (e.key === "Enter" || (e.key === " " && node.type === "FOLDER")) {
      e.preventDefault();
      open(node);
    } else if (e.key.toLowerCase() === "e" && expand?.can(node.id)) {
      expand.run(node.id);
    } else if (isArrow(e.key)) {
      e.preventDefault();
      const from = pos.get(node.id)!;
      const next = step(from, e.key, neighboursOf(node.id).map((id) => ({ id, at: pos.get(id)! })));
      if (next) nodeRefs.current.get(next)?.focus();
    }
  }

  const radius = (n: CanvasNode) => (n.type === "FOLDER" ? FOLDER_RADIUS : nodeRadius(n.linkCount) * (n.id === centre ? 1.5 : 1));
  // A local graph is small enough to name every node, so its labels never fade.
  const labels = centre ? 1 : view ? labelOpacity(view.k) : 0;
  // A local graph is small enough for every label, and its labels stay put.
  const labelled = !centre && labels > 0 && view && size ? visibleLabels(nodes, pos, view, size.w, size.h) : null;
  const offer = picked && expand?.can(picked) ? byId.get(picked) : undefined;
  const card = active && view ? byId.get(active) : undefined;
  const cardAt = card && view ? pos.get(card.id)! : undefined;

  return (
    <div ref={panelRef} className={`relative ${full ? "bg-background" : className} overflow-hidden rounded-[14px] border border-border bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[20px_20px]`}>
      <svg
        ref={svgRef}
        role="group"
        aria-label={label}
        className="size-full touch-none select-none [-webkit-touch-callout:none]"
        // A long press is ours: the phone's own menu would cover the card.
        onContextMenu={(e) => (e.nativeEvent as PointerEvent).pointerType === "touch" && e.preventDefault()}
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
                  style={{ strokeOpacity: on ? 1 : lit || dimmed?.has(e.source) || dimmed?.has(e.target) ? 0.12 : 0.35 }}
                  markerEnd={on ? `url(#${arrowId})` : undefined}
                />
              );
            })}
            {nodes.map((n) => {
              const p = pos.get(n.id)!;
              const r = radius(n);
              const filtered = dimmed?.has(n.id) ?? false;
              const dim = lit ? !lit.has(n.id) : filtered;
              const colour = colours?.get(n.id);
              const shape = n.stub ? (colour ? SHAPE.stubColoured : SHAPE.stub) : n.id === active ? SHAPE.active : colour ? SHAPE.coloured : SHAPE.idle;
              const shapeProps = { className: shape, strokeWidth: 1.2 / view.k, strokeDasharray: n.stub ? `${3 / view.k} ${3 / view.k}` : undefined };
              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(n.id, el);
                    else nodeRefs.current.delete(n.id);
                  }}
                  role={n.type === "FOLDER" ? "button" : "link"}
                  aria-expanded={n.type === "FOLDER" && n.children > 0 ? !n.collapsed : undefined}
                  tabIndex={0}
                  aria-label={filtered ? `${names.get(n.id)}, not in the filter` : names.get(n.id)}
                  data-colour={colour}
                  transform={`translate(${p.x} ${p.y})`}
                  className={`${NODE} ${dim ? "opacity-25" : "opacity-100"}`}
                  onPointerDown={(e) => onPointerDown(e, n.id)}
                  onPointerEnter={() => {
                    setHovered(n.id);
                    setPicked(n.id);
                  }}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => {
                    setFocused(n.id);
                    setPicked(n.id);
                  }}
                  onBlur={() => setFocused(null)}
                  onKeyDown={(e) => onKeyDown(e, n)}
                >
                  {/* A bigger target than a small dot, for a finger. */}
                  <circle r={12 / view.k} className="hidden fill-transparent pointer-coarse:block" />
                  {focused === n.id && <circle r={r + 5 / view.k} className="fill-none stroke-ring" strokeWidth={2 / view.k} />}
                  {n.type === "FOLDER" ? (
                    <polygon points={hexagon(r)} {...shapeProps} />
                  ) : n.type === "NOTE" ? (
                    <circle r={r} {...shapeProps} />
                  ) : (
                    <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={r / 3} {...shapeProps} />
                  )}
                  {n.type === "FOLDER" && n.collapsed && (
                    <text textAnchor="middle" dominantBaseline="central" aria-hidden className="pointer-events-none fill-background font-medium" fontSize={r * 0.85}>
                      {n.children}
                    </text>
                  )}
                  {/* The node's name already says it all, so the label is only for the eye. */}
                  {(centre || labelled?.has(n.id) || lit?.has(n.id)) && (
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
          {card.type === "FOLDER" ? (
            <p className="text-muted-foreground">Folder · {card.children} inside</p>
          ) : tree ? (
            <p className="text-muted-foreground">
              {card.type === "NOTE" ? "Note" : "Asset"} · {where(card)}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {card.type === "NOTE" ? "Note" : "Asset"} · {out.get(card.id)?.length ?? 0} Links ·{" "}
                {into.get(card.id)?.length ?? 0} Backlinks
              </p>
              {(card.stub || colours) && <p className="text-muted-foreground">{where(card)}</p>}
            </>
          )}
          {tagNames?.get(card.id)?.length ? <p className="text-muted-foreground">Tags: {tagNames.get(card.id)!.join(", ")}</p> : null}
        </div>
      )}

      {legend}

      {offer && expand && (
        <Button
          variant="outline"
          size="sm"
          disabled={expand.busy}
          className="absolute top-3 right-3 max-w-[60%]"
          onClick={() => expand.run(offer.id)}
        >
          <span className="truncate">Load neighbours of {offer.title}</span>
        </Button>
      )}

      <div className="absolute right-3 bottom-3 flex gap-1">
        <Tip text="Zoom in">
          <Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => size && zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.25)}>
            <PlusIcon aria-hidden />
          </Button>
        </Tip>
        <Tip text="Zoom out">
          <Button variant="outline" size="icon" aria-label="Zoom out" onClick={() => size && zoomAt({ x: size.w / 2, y: size.h / 2 }, 0.8)}>
            <MinusIcon aria-hidden />
          </Button>
        </Tip>
        <Tip text="Fit the graph">
          <Button variant="outline" size="icon" aria-label="Fit the graph" onClick={() => size && setView(fit(pos, size.w, size.h))}>
            <ScanIcon aria-hidden />
          </Button>
        </Tip>
        {canFull && (
          <Tip text={full ? "Exit full screen" : "Full screen"}>
            <Button
              variant="outline"
              size="icon"
              aria-label={full ? "Exit full screen" : "Full screen"}
              onClick={() => (full ? document.exitFullscreen() : panelRef.current?.requestFullscreen())}
            >
              {full ? <MinimizeIcon aria-hidden /> : <MaximizeIcon aria-hidden />}
            </Button>
          </Tip>
        )}
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

function Tip({ text, children }: { text: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
