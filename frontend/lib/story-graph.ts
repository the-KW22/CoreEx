import type { TagColour } from "@/lib/tag-colour";

// The Graph the marketing page draws while the visitor scrolls (docs/DESIGN.md 6.15): about 60 Items in five clusters,
// laid out from a fixed seed so it looks the same on every visit. Positions are fractions of the frame (0 to 1).
export const CLUSTERS: { name: string; colour: TagColour; at: [number, number] }[] = [
  { name: "Memory", colour: "blue", at: [0.24, 0.3] },
  { name: "Reading", colour: "pink", at: [0.72, 0.24] },
  { name: "Projects", colour: "green", at: [0.5, 0.64] },
  { name: "Ideas", colour: "orange", at: [0.16, 0.76] },
  { name: "People", colour: "teal", at: [0.85, 0.7] },
];
const PER_CLUSTER = 12;

export type StoryNode = { cluster: number; home: [number, number]; scatter: [number, number]; r: number; delay: number };
export type StoryGraph = { nodes: StoryNode[]; links: [number, number][]; suggested: [number, number] };

// A small seeded random number generator (mulberry32).
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));

export function buildGraph(): StoryGraph {
  const rand = random(402);
  const nodes: StoryNode[] = [];
  const links: [number, number][] = [];
  CLUSTERS.forEach(({ at }, c) => {
    for (let i = 0; i < PER_CLUSTER; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = i === 0 ? 0 : 0.06 + rand() * 0.1;
      nodes.push({
        cluster: c,
        home: [clamp(at[0] + Math.cos(angle) * radius * 1.2), clamp(at[1] + Math.sin(angle) * radius)],
        scatter: [0.03 + rand() * 0.94, 0.03 + rand() * 0.94],
        r: i === 0 ? 5.5 : 2.5 + rand() * 2,
        delay: rand(),
      });
      // Each Item links to its cluster's hub or to the Item before it.
      if (i > 0) links.push([c * PER_CLUSTER + (rand() < 0.5 ? 0 : i - 1), c * PER_CLUSTER + i]);
    }
  });
  // A few Links between neighbouring clusters, so the five clusters read as one Graph.
  for (let c = 0; c < CLUSTERS.length; c++) {
    const next = (c + 1) % CLUSTERS.length;
    for (let k = 0; k < 2; k++) links.push([c * PER_CLUSTER + 1 + Math.floor(rand() * 11), next * PER_CLUSTER + 1 + Math.floor(rand() * 11)]);
  }
  // The one suggestion: Memory and Projects are not linked yet, but are close in meaning.
  return { nodes, links, suggested: [4, 2 * PER_CLUSTER + 5] };
}

export type StoryLabel = { text: string; x: number; y: number; width: number; height: number };

// Labels for each cluster and the suggested Link, in a frame of w by h pixels. A label that would leave the frame or
// land on one already placed tries other sides of its Item, then is skipped. Narrow frames get none.
export function placeLabels(graph: StoryGraph, w: number, h: number): StoryLabel[] {
  if (w < 420) return [];
  const font = 11;
  const pad = 24;
  const at = ([x, y]: [number, number]): [number, number] => [pad + x * (w - 2 * pad), pad + y * (h - 2 * pad)];
  const wanted = CLUSTERS.map((c, i) => ({ text: c.name, at: at(graph.nodes[i * PER_CLUSTER].home), gap: 10 }));
  const [a, b] = graph.suggested;
  const pa = at(graph.nodes[a].home);
  const pb = at(graph.nodes[b].home);
  wanted.push({ text: "Suggested Link", at: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], gap: 4 });

  const placed: StoryLabel[] = [];
  for (const { text, at: [x, y], gap } of wanted) {
    const width = text.length * font * 0.62;
    const height = font + 2;
    const tries = [
      [x + gap, y + height / 2],
      [x - gap - width, y + height / 2],
      [x - width / 2, y - gap],
      [x - width / 2, y + gap + height],
    ];
    const fit = tries.find(
      ([lx, ly]) =>
        lx >= 0 && lx + width <= w && ly - height >= 0 && ly <= h && placed.every((o) => !(lx < o.x + o.width && o.x < lx + width && ly - height < o.y && o.y - o.height < ly)),
    );
    if (fit) placed.push({ text, x: fit[0], y: fit[1], width, height });
  }
  return placed;
}
