"use client";

import { Undo2Icon } from "lucide-react";

import { TagBadge } from "@/components/tag-badge";
import { phase } from "@/lib/story";

import { useReveal } from "./use-reveal";

const SCORE = 82;
const card = "rounded-[14px] border border-border bg-surface p-5";

function FitCheck({ p }: { p: number }) {
  const t = phase(p, 0, 0.5);
  return (
    <div className={card}>
      <p className="text-sm font-semibold text-muted-foreground">Fit check</p>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative size-24 shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="9" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--link)" strokeWidth="9" strokeLinecap="round" pathLength={100} strokeDasharray={`${SCORE * t} 100`} />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-mono text-xl font-semibold">{Math.round(SCORE * t)}</span>
        </div>
        <p className="text-sm text-muted-foreground">9 of 11 requirements are covered by your Resume and Facts. Two gaps are named, not hidden.</p>
      </div>
    </div>
  );
}

function ResumeCard() {
  return (
    <div className={card}>
      <p className="text-sm font-semibold text-muted-foreground">Resume editor</p>
      <div className="mt-3 grid gap-2 rounded-lg border border-border bg-background p-4 text-xs">
        <p className="text-sm font-semibold">Alex Rivera</p>
        <p className="text-muted-foreground">Product designer · Lisbon</p>
        <p className="mt-2 font-semibold">Experience</p>
        <p className="text-muted-foreground">Redesigned onboarding and cut sign-up drop-off by 18%.</p>
        <p className="text-muted-foreground">Led a design system used by 6 teams.</p>
      </div>
    </div>
  );
}

function Board({ p }: { p: number }) {
  const move = phase(p, 0.3, 0.6);
  const toast = phase(p, 0.65, 0.8);
  const cols = ["Applied", "Interview", "Offer"];
  return (
    <div className={`${card} relative overflow-hidden`}>
      <p className="text-sm font-semibold text-muted-foreground">Applications</p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        {cols.map((c, i) => (
          <div key={c} className="grid content-start gap-2 rounded-lg bg-background p-2">
            <p className="font-semibold">{c}</p>
            {i === 0 && <p className="rounded-md border border-border bg-surface p-2" style={{ transform: `translateX(calc(${move} * (100% + 0.75rem)))` }}>Designer at Acme</p>}
            {i === 0 && <p className="rounded-md border border-border bg-surface p-2">Lead at Nimbus</p>}
            {i === 2 && <p className="rounded-md border border-border bg-surface p-2">Staff at Orbit</p>}
          </div>
        ))}
      </div>
      <p className="mt-3 flex w-fit items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg" style={{ opacity: toast, transform: `translateY(${(1 - toast) * 8}px)` }}>
        Moved Designer at Acme to Interview
        <span className="flex items-center gap-1 font-semibold text-link"><Undo2Icon className="size-3" /> Undo</span>
      </p>
    </div>
  );
}

function Evidence() {
  return (
    <div className={card}>
      <p className="text-sm font-semibold text-muted-foreground">Grounded in your evidence</p>
      <div className="mt-3 grid gap-3 text-sm">
        <p>Redesigned onboarding and cut sign-up drop-off by 18%.</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TagBadge name="Fact" colour="green" /> from your Note “Onboarding redesign”
        </p>
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">Anything without evidence is left out of a draft, and the draft says so.</p>
      </div>
    </div>
  );
}

export function Career() {
  const [ref, p] = useReveal<HTMLDivElement>(4);
  return (
    <section id="career" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <p className="text-sm font-medium text-link">Career</p>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">Run your job search from the same place.</h2>
      <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground">
        Keep your Resumes and Applications next to your Notes. Career&apos;s AI drafts only from what you have confirmed, and shows where each claim came from.
      </p>
      <div ref={ref} aria-hidden className="mt-12 grid gap-4 md:grid-cols-2">
        <FitCheck p={p} />
        <ResumeCard />
        <Board p={p} />
        <Evidence />
      </div>
    </section>
  );
}
