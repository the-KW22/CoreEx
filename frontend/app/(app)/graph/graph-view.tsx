"use client";

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import type { Folder } from "@/lib/folders";
import { isArrow, linkMaps, nodeLabel, nodeRadius, step, where, type GraphEdge, type GraphNode, type Point } from "@/lib/graph";
import { itemHref } from "@/lib/items";

import { FolderSelect } from "../folders/folder-select";
import { ViewToggle } from "../items/view-toggle";

type View = { x: number; y: number; k: number };
type Gesture = { kind: "pan"; from: Point; view: View } | { kind: "node"; id: string; moved: boolean };

const clampZoom = (k: number) => Math.min(Math.max(k, 0.2), 4);

// Runs the simulation to rest up front, so the graph appears settled and never moves on its own.
function layout(nodes: GraphNode[], edges: GraphEdge[]) {
  const placed = nodes.map((n) => ({ id: n.id, r: nodeRadius(n.linkCount) }) as { id: string; r: number; x?: number; y?: number });
  forceSimulation(placed)
    .force("link", forceLink(edges.map((e) => ({ ...e }))).id((d) => (d as { id: string }).id).distance(70))
    .force("charge", forceManyBody().strength(-140))
    .force("collide", forceCollide<(typeof placed)[number]>((d) => d.r + 6))
    // A gentle pull to the middle keeps Items without Links from drifting away.
    .force("x", forceX(0).strength(0.04))
    .force("y", forceY(0).strength(0.04))
    .stop()
    .tick(300);
  return new Map(placed.map((p) => [p.id, { x: p.x ?? 0, y: p.y ?? 0 }]));
}

// The View that fits every node into a w × h box.
function fit(pos: Map<string, Point>, w: number, h: number): View {
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = clampZoom(Math.min(w / (maxX - minX + 120), h / (maxY - minY + 120), 1.5));
  return { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k };
}

export function GraphView({
  graph,
  folders,
  folderId,
}: {
  graph: components["schemas"]["GraphResponse"];
  folders: Folder[];
  folderId: string | null;
}) {
  const router = useRouter();
  const { edges } = graph;
  const nodes = useMemo(() => graph.nodes.map((n) => ({ ...n, title: n.title || "Untitled" })), [graph.nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.title])), [nodes]);
  const { out, into } = useMemo(() => linkMaps(edges), [edges]);
  // A server action refreshes the page with new data (lib/refresh.ts), so lay the graph out again when it changes.
  const [laidOut, setLaidOut] = useState(() => ({ graph, pos: layout(nodes, edges) }));
  let pos = laidOut.pos;
  if (laidOut.graph !== graph) {
    pos = layout(nodes, edges);
    setLaidOut({ graph, pos });
  }
  const setPos = (next: (p: Map<string, Point>) => Map<string, Point>) => setLaidOut((l) => ({ ...l, pos: next(l.pos) }));
  const [size, setSize] = useState<{ w: number; h: number }>();
  const [view, setView] = useState<View>();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const gesture = useRef<Gesture | null>(null);

  const listHref = folderId ? `/folders/${folderId}` : "/items";
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
  }, [table]);

  // React's onWheel is passive, and zooming must stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, Math.exp(-e.deltaY * 0.0015));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [table]);

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
      setPos((p) => new Map(p).set(g.id, { x: (at.x - view.x) / view.k, y: (at.y - view.y) / view.k }));
    }
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === "node" && !g.moved) router.push(itemHref(byId.get(g.id)!));
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

  const scope = folderId ? (folders.find((f) => f.id === folderId)?.name ?? "this Folder") : "All Items";
  const card = active && view ? byId.get(active) : undefined;
  const cardAt = card && view ? pos.get(card.id)! : undefined;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Graph</h1>
          <FolderSelect
            name="folderId"
            label="Folder"
            folders={folders}
            selected={folderId}
            emptyLabel="All Items"
            onChange={(id) => router.push(id ? `/graph?folderId=${id}` : "/graph")}
            className="w-56"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {nodes.length > 0 && (
            <Button variant="outline" aria-pressed={table} onClick={() => setTable(!table)}>
              {table ? "Show as graph" : "Show as table"}
            </Button>
          )}
          <ViewToggle saved="graph" listHref={listHref} />
        </div>
      </header>

      {graph.truncated && (
        <Alert role="status" tone="neutral">
          Showing {nodes.length} of {graph.total} Items. Open a smaller Folder to see them all.
        </Alert>
      )}

      {nodes.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-[14px] border border-dashed border-border px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">Map how your Items connect</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Every Note and Asset in {scope} appears here as a dot, and every Link as a line. Type [[ in a Note to link it.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href={listHref}>Open {scope}</Link>
          </Button>
        </div>
      ) : table ? (
        <GraphTable nodes={nodes} titles={titles} out={out} into={into} />
      ) : (
        <div className="relative h-[70vh] min-h-96 overflow-hidden rounded-[14px] border border-border bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[20px_20px]">
          <svg
            ref={svgRef}
            role="group"
            aria-label={`Graph of ${scope}: ${nodes.length} Items. Tab to an Item, arrow keys move along its Links.`}
            className="size-full touch-none select-none"
            onPointerDown={(e) => onPointerDown(e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
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
                  const gap = (nodeRadius(byId.get(e.target)!.linkCount) + 3) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
                  return (
                    <line
                      key={`${e.source}-${e.target}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x - (b.x - a.x) * gap}
                      y2={b.y - (b.y - a.y) * gap}
                      className={on ? "stroke-link" : "stroke-muted-foreground"}
                      strokeWidth={(on ? 1.6 : 0.8) / view.k}
                      strokeDasharray={stub ? `${4 / view.k} ${4 / view.k}` : undefined}
                      strokeOpacity={on ? 1 : lit ? 0.12 : 0.35}
                      markerEnd={on ? "url(#graph-arrow)" : undefined}
                    />
                  );
                })}
                {nodes.map((n) => {
                  const p = pos.get(n.id)!;
                  const r = nodeRadius(n.linkCount);
                  const dim = lit !== null && !lit.has(n.id);
                  const showLabel = view.k >= 1.5 || (lit?.has(n.id) ?? false);
                  const shape = n.stub
                    ? "fill-background stroke-muted-foreground"
                    : n.id === active
                      ? "fill-foreground"
                      : "fill-muted-foreground";
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
                      aria-label={nodeLabel(n, titles, out.get(n.id) ?? [], into.get(n.id) ?? [])}
                      transform={`translate(${p.x} ${p.y})`}
                      opacity={dim ? 0.25 : 1}
                      className="cursor-pointer outline-none"
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
                      {showLabel && (
                        <text y={r + 14 / view.k} textAnchor="middle" className="fill-foreground" fontSize={12 / view.k}>
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
          </div>
        </div>
      )}
    </div>
  );
}

// The same graph as rows, for anyone who can't or would rather not use the picture.
function GraphTable({
  nodes,
  titles,
  out,
  into,
}: {
  nodes: GraphNode[];
  titles: Map<string, string>;
  out: Map<string, string[]>;
  into: Map<string, string[]>;
}) {
  const names = (ids: string[] | undefined) => ids?.map((id) => titles.get(id)).join(", ") || "None";
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Items and their Links</caption>
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-2 font-medium">Item</th>
            <th scope="col" className="px-4 py-2 font-medium">Kind</th>
            <th scope="col" className="px-4 py-2 font-medium">Links to</th>
            <th scope="col" className="px-4 py-2 font-medium">Linked from</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id} className="border-b border-border-subtle last:border-0">
              <th scope="row" className="px-4 py-2 font-medium">
                <Link href={itemHref(n)} className="hover:underline">
                  {n.title}
                </Link>
                {n.stub && <span className="block text-xs font-normal text-muted-foreground">{where(n)}</span>}
              </th>
              <td className="px-4 py-2">{n.type === "NOTE" ? "Note" : "Asset"}</td>
              <td className="px-4 py-2">{names(out.get(n.id))}</td>
              <td className="px-4 py-2">{names(into.get(n.id))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
