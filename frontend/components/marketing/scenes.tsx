import { FileTextIcon, ImageIcon, SparklesIcon } from "lucide-react";

import { TagBadge } from "@/components/tag-badge";
import { phase } from "@/lib/story";

import { ConnectScene } from "./connect-scene";
import type { RailId } from "./window";

// The four scenes of the story, each a pure function of its own progress `p` (0 to 1), so the same markup is the
// finished picture (p = 1) on phones and with reduced motion. They mirror the real screens (docs/DESIGN.md 6.3, 6.4, 6.14).
const typed = (text: string, p: number) => text.slice(0, Math.round(text.length * p));

const NOTE = "Reviewing a card just before you forget it makes the memory last. It builds on ";
const SUGGESTIONS = ["Active recall", "Forgetting curve", "Memory palace"];

function WriteScene({ p }: { p: number }) {
  const typing = phase(p, 0, 0.25);
  const open = p >= 0.25 && p < 0.6;
  const done = p >= 0.6;
  return (
    <div className="grid content-start gap-3 p-5 text-sm sm:p-7">
      <p className="text-xl font-semibold sm:text-2xl">Spaced repetition</p>
      <p className="font-reading leading-7 text-muted-foreground">
        {NOTE}
        {done ? (
          <span className="font-semibold text-link underline underline-offset-4">[[Active recall]]</span>
        ) : (
          <span className="font-mono">{typed("[[", typing)}</span>
        )}
        {!done && <span aria-hidden className="ml-px inline-block h-4 w-px translate-y-0.5 bg-foreground" />}
        {done && " and the forgetting curve."}
      </p>
      <div className="relative h-0">
        {open && (
          <ul className="absolute top-0 left-8 z-10 w-52 rounded-[10px] border border-border bg-surface-raised p-1 text-xs shadow-lg">
            {SUGGESTIONS.map((s, i) => (
              <li key={s} className={i === 0 ? "rounded-md bg-surface px-2 py-1.5 font-semibold text-foreground" : "px-2 py-1.5 text-muted-foreground"}>
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-16 flex items-center gap-2 text-xs text-muted-foreground" style={{ opacity: done ? 1 : 0 }}>
        <span className="size-1.5 rounded-full bg-success" /> Saved · 1 Link
      </p>
    </div>
  );
}

const ASSETS = [
  { name: "Lecture slides.pdf", size: "2.4 MB", tag: "blue" as const, Icon: FileTextIcon },
  { name: "Whiteboard.png", size: "860 KB", tag: "pink" as const, Icon: ImageIcon },
  { name: "Paper.pdf", size: "1.1 MB", tag: "green" as const, Icon: FileTextIcon },
];

function KeepScene({ p }: { p: number }) {
  return (
    <div className="grid content-start gap-5 p-5 text-sm sm:p-7">
      <div className="grid gap-2 rounded-[14px] border border-dashed border-border p-4">
        <div className="flex justify-between text-xs">
          <span className="font-semibold">Uploading Lecture slides.pdf</span>
          <span className="font-mono text-muted-foreground">{Math.round(phase(p, 0, 0.45) * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full origin-left bg-link" style={{ transform: `scaleX(${phase(p, 0, 0.45)})` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {ASSETS.map(({ name, size, tag, Icon }, i) => {
          const shown = phase(p, 0.5 + i * 0.15, 0.65 + i * 0.15);
          return (
            <div key={name} className="grid gap-2 rounded-[14px] border border-border bg-surface p-3" style={{ opacity: shown, transform: `translateY(${(1 - shown) * -16}px)` }}>
              <Icon className="size-5 text-muted-foreground" />
              <span className="truncate text-xs font-semibold">{name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{size}</span>
              <TagBadge name={tag === "blue" ? "course" : tag === "pink" ? "sketch" : "reading"} colour={tag} className="w-fit" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ANSWER = "Spaced repetition means reviewing a card just before you forget it. Your Notes link it to Active recall, and the Paper explains the forgetting curve.";

function AskScene({ p }: { p: number }) {
  const sources = phase(p, 0.7, 0.9);
  return (
    <div className="grid content-start gap-4 p-5 text-sm sm:p-7">
      <p className="ml-auto max-w-[80%] rounded-[14px] bg-surface px-3.5 py-2.5">How does spaced repetition fit with my study notes?</p>
      <div className="grid gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <SparklesIcon className="size-3.5" /> Chat
        </p>
        <p className="font-reading leading-7">{typed(ANSWER, phase(p, 0.05, 0.65))}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ opacity: sources, transform: `translateY(${(1 - sources) * 8}px)` }}>
          <span className="text-muted-foreground">Sources</span>
          {["Spaced repetition", "Active recall", "Paper.pdf"].map((s) => (
            <span key={s} className="rounded-full border border-border px-2.5 py-1 font-semibold">{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// What the window shows for each step: its rail entry, its title and its picture.
export const SCENES: { rail: RailId; title: string; Scene: (props: { p: number }) => React.ReactNode }[] = [
  { rail: "kb", title: "Spaced repetition", Scene: WriteScene },
  { rail: "assets", title: "Assets", Scene: KeepScene },
  { rail: "graph", title: "Graph", Scene: ConnectScene },
  { rail: "chat", title: "Chat", Scene: AskScene },
];
