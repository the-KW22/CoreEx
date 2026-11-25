"use client";

import { phase } from "@/lib/story";

import { useReveal } from "./use-reveal";

const LINES = [
  { text: "Save what we just worked out as a Note called Spaced repetition.", prompt: true },
  { text: 'coreex.create_note(title: "Spaced repetition", folder: "Study")', prompt: false },
  { text: "Saved. It links to Active recall.", prompt: false },
];
const STARTS = LINES.map((_, i) => LINES.slice(0, i).reduce((n, l) => n + l.text.length, 0));
const TOTAL = LINES.reduce((n, l) => n + l.text.length, 0);

// A terminal types an Agent saving a Note through MCP when it scrolls into view; then the Note card slides in.
export function Agents() {
  const [ref, p] = useReveal<HTMLDivElement>(5);
  const typed = Math.round(phase(p, 0, 0.7) * TOTAL);
  const card = phase(p, 0.75, 0.95);
  return (
    <section id="agents" className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 md:grid-cols-2 md:items-center">
      <div>
        <p className="text-sm font-medium text-link">Agents</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">Your AI agent can use it too.</h2>
        <p className="mt-4 text-lg text-pretty text-muted-foreground">
          Connect Claude Desktop, Claude Code or any MCP client with an access token. It can search, read and write your Notes, and every change it makes is marked and kept in the Note&apos;s History.
        </p>
      </div>
      <div ref={ref} aria-hidden className="grid gap-4">
        <div className="rounded-[14px] border border-border bg-surface p-4 font-mono text-xs leading-6 sm:text-sm">
          {LINES.map((l, i) => {
            const shown = l.text.slice(0, Math.max(0, typed - STARTS[i]));
            return (
              <p key={l.text} className={l.prompt ? "relative text-foreground" : "relative text-muted-foreground"}>
                {/* The full line, invisible, holds the line's final height so the page below never moves while it types. */}
                <span className="invisible">{l.prompt && <span className="mr-2">&gt;</span>}{l.text}</span>
                <span className="absolute inset-0">
                  {l.prompt && <span className="mr-2 text-link">&gt;</span>}
                  {shown}
                </span>
              </p>
            );
          })}
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-4" style={{ opacity: card, transform: `translateY(${(1 - card) * 24}px)` }}>
          <p className="font-semibold">Spaced repetition</p>
          <p className="mt-1 text-sm text-muted-foreground">Changed by Claude Desktop just now</p>
        </div>
      </div>
    </section>
  );
}
