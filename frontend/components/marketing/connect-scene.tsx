"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { phase } from "@/lib/story";
import { buildGraph, CLUSTERS, placeLabels } from "@/lib/story-graph";

const GRAPH = buildGraph();
const PAD = 24;
const ease = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// The Connect scene: Items fly from scattered places into five clusters, the Links draw in, then one dashed Mint
// "Suggested Link" and a few labels appear (docs/DESIGN.md 6.15). A canvas, like the real Graph, drawn from `p`
// (0 to 1). It idles with a gentle drift only while it is on screen and motion is welcome.
export function ConnectScene({ p }: { p: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [theme, setTheme] = useState(0);
  const labels = useMemo(() => placeLabels(GRAPH, size.w, size.h), [size]);
  const render = useRef<(time: number) => void>(() => {});

  // The latest drawing code, so the effects below always call the current props, size and colours.
  const draw = (time: number) => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !size.w) return;
    const style = getComputedStyle(el);
    const colour = (name: string) => style.getPropertyValue(name).trim();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const scale = Math.min(1.3, size.w / 600);
    const at = (i: number): [number, number] => {
      const n = GRAPH.nodes[i];
      const t = ease(phase(p, 0.02 + n.delay * 0.2, 0.5 + n.delay * 0.2));
      const drift = (axis: number) => Math.sin(time / 1700 + i * 1.7 + axis * 2) * 3;
      const x = lerp(n.scatter[0], n.home[0], t);
      const y = lerp(n.scatter[1], n.home[1], t);
      return [PAD + x * (size.w - 2 * PAD) + drift(0), PAD + y * (size.h - 2 * PAD) + drift(1)];
    };

    ctx.lineWidth = 1;
    ctx.strokeStyle = colour("--muted-foreground");
    ctx.globalAlpha = 0.35;
    GRAPH.links.forEach(([a, b], i) => {
      const draw = ease(phase(p, 0.5 + (i / GRAPH.links.length) * 0.2, 0.7 + (i / GRAPH.links.length) * 0.2));
      if (!draw) return;
      const [ax, ay] = at(a);
      const [bx, by] = at(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(lerp(ax, bx, draw), lerp(ay, by, draw));
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
    GRAPH.nodes.forEach((n, i) => {
      const [x, y] = at(i);
      ctx.fillStyle = colour(`--tag-${CLUSTERS[n.cluster].colour}`);
      ctx.beginPath();
      ctx.arc(x, y, n.r * scale, 0, Math.PI * 2);
      ctx.fill();
    });

    const suggest = ease(phase(p, 0.85, 0.95));
    if (suggest) {
      const [ax, ay] = at(GRAPH.suggested[0]);
      const [bx, by] = at(GRAPH.suggested[1]);
      ctx.strokeStyle = colour("--link");
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = suggest;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(lerp(ax, bx, suggest), lerp(ay, by, suggest));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = phase(p, 0.88, 0.98);
    ctx.font = `600 11px ${style.fontFamily}`;
    ctx.textBaseline = "alphabetic";
    for (const l of labels) {
      ctx.fillStyle = l.text === "Suggested Link" ? colour("--link") : colour("--foreground");
      ctx.fillText(l.text, l.x, l.y - 2);
    }
    ctx.globalAlpha = 1;
  };
  useEffect(() => {
    render.current = draw;
  });

  // Size the canvas to its box, sharp on high-density screens.
  useEffect(() => {
    const el = canvas.current!;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      setSize({ w, h });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Colours come from the theme tokens, so redraw when the theme changes (a picked one or the OS's).
  useEffect(() => {
    const bump = () => setTheme((t) => t + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", bump);
    };
  }, []);

  useEffect(() => render.current(0), [p, size, theme, labels]);

  // The idle drift: only while on screen, and never with reduced motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const tick = (time: number) => {
      render.current(time);
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry.isIntersecting) frame = requestAnimationFrame(tick);
    });
    observer.observe(canvas.current!);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="A Graph of about 60 Items in five clusters named Memory, Reading, Projects, Ideas and People. Links join the Items, and one dashed Suggested Link joins Memory to Projects."
      className="block size-full"
    />
  );
}
