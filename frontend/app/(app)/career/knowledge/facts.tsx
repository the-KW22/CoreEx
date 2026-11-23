"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";

import { candidatesOf, correctFact, createFact, forgetFact, pullFact, setFactStatus } from "./actions";

type Fact = components["schemas"]["FactResponse"];
type Category = components["schemas"]["FactRequest"]["category"];
type Candidate = components["schemas"]["CandidateResponse"];

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "EXPERIENCE", label: "Experience" },
  { value: "SKILL", label: "Skill" },
  { value: "ACHIEVEMENT", label: "Achievement" },
  { value: "EDUCATION", label: "Education" },
  { value: "OTHER", label: "Other" },
];

const label = (value: string) => CATEGORIES.find((c) => c.value === value)?.label ?? value;

const field = "h-9 rounded-lg border border-border bg-surface px-3";

// Facts (Career decisions C2, C13): what the User has said is true about their experience. Switched-off Facts stay
// but are never sent to a model; forgetting one removes its text for good.
export function Facts({ facts, sources, forRequirement }: { facts: Fact[]; forRequirement?: string; sources: { resumes: { id: string; title: string }[]; notes: { id: string; title: string }[] } }) {
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "OFF">("ALL");
  const [category, setCategory] = useState<"ALL" | Category>("ALL");
  const shown = facts.filter((f) => (status === "ALL" || f.status === status) && (category === "ALL" || f.category === category));
  return (
    <section aria-labelledby="facts-heading" className="grid gap-4">
      <h2 id="facts-heading" className="text-lg font-semibold">Facts</h2>
      <AddFact forRequirement={forRequirement} />
      <PullFacts sources={sources} />
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm font-medium">Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={field}>
            <option value="ALL">All</option><option value="ACTIVE">Used by AI</option><option value="OFF">Switched off</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Category
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={field}>
            <option value="ALL">All</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No Facts match. Add one above.</p>}
      <ul className="grid gap-3">
        {shown.map((fact) => <FactRow key={fact.id} fact={fact} />)}
      </ul>
    </section>
  );
}

// forRequirement: opened from a Fit check's "Add evidence"; the box is focused and the requirement shown, never filled in.
function AddFact({ forRequirement }: { forRequirement?: string }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("EXPERIENCE");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-3 rounded-lg border border-border p-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const result = await createFact(text, category);
        if (result.ok) { setText(""); setError(""); } else setError(result.message);
      });
    }}>
      {forRequirement && <p className="text-sm">Adding evidence for: <q>{forRequirement}</q>. Only add it if it is true.</p>}
      <label className="grid gap-1 text-sm font-medium">Fact
        <textarea autoFocus={!!forRequirement} value={text} maxLength={2000} required onChange={(e) => setText(e.target.value)} className="min-h-16 rounded-lg border border-border bg-surface p-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium">Category
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={field}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={pending || !text.trim()} className="justify-self-start">{pending ? "Adding…" : "Add Fact"}</Button>
    </form>
  );
}

// Suggests Facts from a Resume or Note without AI: one candidate per line, with the exact words it came from.
function PullFacts({ sources }: { sources: { resumes: { id: string; title: string }[]; notes: { id: string; title: string }[] } }) {
  const [kind, setKind] = useState<"RESUME" | "NOTE">("RESUME");
  const [sourceId, setSourceId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const list = kind === "RESUME" ? sources.resumes : sources.notes;
  return (
    <details className="rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Pull Facts from a Resume or Note</summary>
      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm font-medium">Source
            <select value={kind} onChange={(e) => { setKind(e.target.value as "RESUME" | "NOTE"); setSourceId(""); setCandidates(null); }} className={field}>
              <option value="RESUME">Resume</option><option value="NOTE">Note</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">{kind === "RESUME" ? "Resume" : "Note"}
            <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setCandidates(null); }} className={field}>
              <option value="">Choose one</option>{list.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" disabled={!sourceId || pending} className="self-end" onClick={() => start(async () => {
            const result = await candidatesOf(kind, sourceId);
            if ("candidates" in result) { setCandidates(result.candidates); setError(""); } else setError(result.message);
          })}>Show lines</Button>
        </div>
        {error && <Alert>{error}</Alert>}
        {candidates && candidates.length === 0 && <p className="text-sm text-muted-foreground">No new lines in this source.</p>}
        {candidates?.map((c) => <CandidateRow key={`${c.sourceId}:${c.quote}`} candidate={c} />)}
      </div>
    </details>
  );
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const [text, setText] = useState(candidate.quote ?? "");
  const [category, setCategory] = useState<Category>("EXPERIENCE");
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();
  if (added) return null;
  return (
    <form className="grid gap-2 rounded-lg border border-border p-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const result = await pullFact(text, category, candidate.sourceKind as "RESUME" | "NOTE", candidate.sourceId ?? "", candidate.quote ?? "");
        if (result.ok) setAdded(true); else setError(result.message);
      });
    }}>
      <p className="text-sm text-muted-foreground">From the source: <q>{candidate.quote}</q></p>
      <label className="grid gap-1 text-sm font-medium">Fact text
        <textarea value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} className="min-h-12 rounded-lg border border-border bg-surface p-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium">Category
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={field}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="outline" disabled={pending || !text?.trim()} className="justify-self-start">Add as Fact</Button>
    </form>
  );
}

function FactRow({ fact }: { fact: Fact }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text ?? "");
  const [category, setCategory] = useState<Category>(fact.category as Category);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => start(async () => {
    const result = await action();
    if (result.ok) { setEditing(false); setError(""); } else setError(result.message ?? "Something went wrong. Try again.");
  });
  return (
    <li className="grid gap-2 rounded-lg border border-border p-4">
      {editing ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm font-medium">Fact text
            <textarea value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} className="min-h-16 rounded-lg border border-border bg-surface p-3" />
          </label>
          <label className="grid gap-1 text-sm font-medium">Category
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={field}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" disabled={pending || !text.trim()} onClick={() => run(() => correctFact(fact.id, text, category))}>Save Fact</Button>
            <Button type="button" variant="ghost" onClick={() => { setEditing(false); setText(fact.text ?? ""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm">{fact.text}</p>
          <p className="text-xs text-muted-foreground">
            {label(fact.category)}{fact.status === "OFF" ? " · Switched off: never sent to AI" : ""}{fact.quote ? ` · From ${fact.sourceKind === "RESUME" ? "your Resume" : fact.sourceKind === "CHAT" ? "a Chat" : "your Note"}` : " · Added by hand"}
          </p>
          {fact.quote && <q className="text-xs text-muted-foreground">{fact.quote}</q>}
          {fact.revisions.length > 0 && <p className="text-xs text-muted-foreground">Earlier wording: {fact.revisions.map((r) => r.text).join(" / ")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setEditing(true)}>Edit</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setFactStatus(fact.id, fact.status === "OFF" ? "ACTIVE" : "OFF"))}>
              {fact.status === "OFF" ? "Switch on for AI" : "Switch off for AI"}
            </Button>
            {confirming ? (
              <>
                <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => forgetFact(fact.id))}>Forget for good</Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
              </>
            ) : (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>Forget</Button>
            )}
          </div>
          {confirming && <p className="text-xs">Forgetting deletes this text and its earlier wordings. It cannot be undone, and a pulled line is not suggested again.</p>}
        </>
      )}
      {error && <Alert>{error}</Alert>}
    </li>
  );
}
