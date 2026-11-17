"use client";

import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { countAnswer, overLimit, type LimitUnit } from "@/lib/career/answer-count";

import {
  acceptResult,
  draftAnswer,
  getSuggestions,
  keepAnswer,
  type Outcome,
  rejectResult,
  reuseAnswer,
  removeFromLibrary,
  removeQuestion,
  saveQuestion,
  tightenAnswer,
} from "./apply-actions";

type Question = components["schemas"]["QuestionResponse"];
type Library = components["schemas"]["Library"];
type Result = components["schemas"]["ResultResponse"];
type Suggestion = components["schemas"]["SuggestionResponse"];
type Scope = components["schemas"]["KeepRequest"]["scope"];

const field = "h-9 rounded-lg border border-border bg-surface px-3";
const SCOPES: Record<Scope, string> = { REUSABLE: "Reusable", EMPLOYER: "This employer only", JOB: "This job only" };
const EVIDENCE: Record<string, string> = { FACT: "Fact", STORY: "Story" };

export const unitOf = (value: string | null): LimitUnit | null => (value === "WORDS" || value === "CHARS" ? value : null);
export const noun = (unit: LimitUnit | null, n: number) => (unit === "CHARS" ? (n === 1 ? "character" : "characters") : n === 1 ? "word" : "words");

// The live count: "42 of 100 words", "42 words" with no limit, or "Over the limit by 7 words" (said in words, not colour).
function countLine(unit: LimitUnit | null, limit: number | null, text: string) {
  if (unit === null || limit === null) {
    const count = countAnswer("WORDS", text);
    return { over: false, text: `${count} ${noun(null, count)}` };
  }
  const count = countAnswer(unit, text);
  if (overLimit(unit, limit, text)) return { over: true, text: `Over the limit by ${count - limit} ${noun(unit, count - limit)}` };
  return { over: false, text: `${count} of ${limit} ${noun(unit, limit)}` };
}

// Shared with the Fit tab: a notice that the posting, Knowledge or documents changed since this was made.
export function OutOfDate() {
  return (
    <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <strong>Out of date.</strong> Your posting, Knowledge or documents have changed since this was made. Run it again to refresh it.
    </p>
  );
}

export function QuestionCard({ applicationId, question: q, library }: { applicationId: string; question: Question; library: Library }) {
  const id = useId();
  const unit = unitOf(q.limitUnit);
  const [text, setText] = useState(q.answer);
  const [error, setError] = useState("");
  const [kept, setKept] = useState(false);
  const [keepAs, setKeepAs] = useState<Scope>("REUSABLE");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [pending, start] = useTransition();
  const dirty = text !== q.answer;
  const blank = q.answer.trim() === "";
  const count = countLine(unit, q.limitValue, text);
  const proposed = library.results.find((r) => (r.kind === "DRAFT" || r.kind === "TIGHTEN") && r.answer?.questionId === q.id && r.resolution === null);
  const unsaved = dirty ? ` ${id}-unsaved` : "";

  const run = (call: () => Promise<Outcome>, onOk?: () => void) =>
    start(async () => {
      const result = await call();
      setError(result.ok ? "" : result.message);
      if (result.ok) onOk?.();
    });
  const findSaved = () =>
    start(async () => {
      const result = await getSuggestions(applicationId, q.id);
      if (result.ok) {
        setSuggestions(result.items.slice(0, 3));
        setError("");
      } else setError(result.message);
    });

  return (
    <li className="grid gap-4 rounded-lg border border-border p-4">
      <h3 className="font-semibold">{q.question}</h3>
      <div className="grid gap-1">
        <label htmlFor={`${id}-answer`} className="text-sm font-medium">Answer</label>
        <textarea
          id={`${id}-answer`}
          aria-label={`Answer to ${q.question}`}
          aria-describedby={`${id}-count`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-32 rounded-lg border border-border bg-surface p-3"
        />
        <p id={`${id}-count`} aria-live="polite" className={`text-sm ${count.over ? "font-medium text-destructive" : "text-muted-foreground"}`}>
          {count.text}
        </p>
      </div>
      <Button
        type="button"
        className="justify-self-start"
        disabled={pending || !dirty}
        onClick={() =>
          run(() => saveQuestion(applicationId, q.id, { question: q.question, limitUnit: q.limitUnit, limitValue: q.limitValue, answer: text, version: q.version }))
        }
      >
        Save answer
      </Button>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || dirty}
            aria-describedby={`${id}-draft-sends${unsaved}`}
            onClick={() => run(() => draftAnswer(applicationId, q.id))}
          >
            Draft with AI
          </Button>
          <p id={`${id}-draft-sends`} className="text-sm text-muted-foreground">{library.sends.DRAFT}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || dirty || blank}
            aria-describedby={`${id}-tighten-sends${unsaved}`}
            onClick={() => run(() => tightenAnswer(applicationId, q.id))}
          >
            Tighten
          </Button>
          <p id={`${id}-tighten-sends`} className="text-sm text-muted-foreground">{library.sends.TIGHTEN}</p>
        </div>
        {dirty && <p id={`${id}-unsaved`} className="text-sm">Save your answer first.</p>}
      </div>
      {proposed && (
        <ProposedAnswer
          result={proposed}
          unit={unit}
          limit={q.limitValue}
          disabled={pending}
          onAccept={() => run(() => acceptResult(applicationId, proposed.id, q.version))}
          onReject={() => run(() => rejectResult(applicationId, proposed.id))}
        />
      )}
      <div className="grid gap-2 border-t border-border pt-4">
        <h4 className="text-sm font-semibold">Keep for later</h4>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm font-medium">
            Keep as
            <select
              value={keepAs}
              onChange={(e) => {
                setKeepAs(e.target.value as Scope);
                setKept(false);
              }}
              className={field}
            >
              {(Object.keys(SCOPES) as Scope[]).map((scope) => (
                <option key={scope} value={scope}>{SCOPES[scope]}</option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" disabled={pending || blank} onClick={() => run(() => keepAnswer(applicationId, q.id, keepAs), () => setKept(true))}>
            Keep answer
          </Button>
        </div>
        {kept && <Alert role="status" tone="neutral">Kept for later.</Alert>}
        <Button type="button" variant="outline" disabled={pending} onClick={findSaved} className="justify-self-start">
          Find saved answers
        </Button>
        {suggestions &&
          (suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved answers match this question yet.</p>
          ) : (
            <ul className="grid gap-2">
              {suggestions.map((s) => (
                <li key={s.id} className="grid gap-1 rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{s.question}</p>
                  <p className="whitespace-pre-wrap">{s.answer}</p>
                  <p className="text-muted-foreground">{SCOPES[s.scope]}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => reuseAnswer(applicationId, q.id, s.id, q.version))}>
                      Use this answer<span className="sr-only"> for {s.question}</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => removeFromLibrary(applicationId, s.id), () => setSuggestions((list) => list?.filter((x) => x.id !== s.id) ?? null))}
                    >
                      Remove from library<span className="sr-only"> for {s.question}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => removeQuestion(applicationId, q.id))} className="justify-self-start">
        Remove question
      </Button>
    </li>
  );
}

// A Draft or Tightened answer the User has not yet accepted or rejected.
function ProposedAnswer({
  result,
  unit,
  limit,
  disabled,
  onAccept,
  onReject,
}: {
  result: Result;
  unit: LimitUnit | null;
  limit: number | null;
  disabled: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const count = countLine(unit, limit, result.answer.text);
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <h4 className="text-sm font-semibold">{result.kind === "DRAFT" ? "Draft" : "Tightened answer"}</h4>
      {result.outOfDate && <OutOfDate />}
      <p className="whitespace-pre-wrap text-sm">{result.answer.text}</p>
      <p className={`text-sm ${count.over ? "font-medium text-destructive" : "text-muted-foreground"}`}>{count.text}</p>
      {result.answer.evidence.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {result.answer.evidence.map((e) => (
            <li key={e.id}>
              <span className="text-muted-foreground">{EVIDENCE[e.kind] ?? "Resume"}: </span>
              <q>{e.label}</q>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={disabled} onClick={onAccept}>Accept</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={onReject}>Reject</Button>
      </div>
    </div>
  );
}

