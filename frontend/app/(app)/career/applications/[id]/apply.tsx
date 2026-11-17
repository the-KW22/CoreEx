"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatDay } from "@/lib/applications";
import type { LimitUnit } from "@/lib/career/answer-count";

import { addQuestion, markApplied } from "./apply-actions";
import { noun, QuestionCard, unitOf } from "./apply-question";

type Apply = components["schemas"]["ApplyResponse"];
type Library = components["schemas"]["Library"];

const field = "h-9 rounded-lg border border-border bg-surface px-3";

// The Apply tab: the employer's form questions with their answers, the answer library and Mark as applied.
export function ApplyPanel({ applicationId, stage, apply, library }: { applicationId: string; stage: string; apply: Apply; library: Library }) {
  return (
    <section aria-labelledby="apply-heading" className="grid gap-6">
      <div className="grid gap-1">
        <h2 id="apply-heading" className="text-lg font-semibold">Form questions</h2>
        <p className="text-sm text-muted-foreground">The questions on the employer&apos;s form. CoreEx counts each answer against its limit.</p>
      </div>
      <AddQuestion applicationId={applicationId} />
      {apply.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet. Add the ones on the employer&apos;s form.</p>
      ) : (
        <ul className="grid gap-4">
          {apply.questions.map((q) => (
            // Keyed by version, so a saved or accepted answer shows its new text.
            <QuestionCard key={`${q.id}-${q.version}`} applicationId={applicationId} question={q} library={library} />
          ))}
        </ul>
      )}
      <MarkApplied applicationId={applicationId} stage={stage} apply={apply} />
    </section>
  );
}

function AddQuestion({ applicationId }: { applicationId: string }) {
  const [question, setQuestion] = useState("");
  const [unit, setUnit] = useState<LimitUnit | "">("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const limitValue = Number(limit);
  const limitOk = unit === "" || (Number.isInteger(limitValue) && limitValue > 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    start(async () => {
      const result = await addQuestion(applicationId, {
        question: question.trim(),
        limitUnit: unit || null,
        limitValue: unit ? limitValue : null,
      });
      if (result.ok) {
        setQuestion("");
        setUnit("");
        setLimit("");
        setError("");
      } else setError(result.message);
    });
  };
  return (
    <form onSubmit={submit} aria-labelledby="add-question-heading" className="grid gap-3 rounded-lg border border-border p-3">
      <h3 id="add-question-heading" className="text-sm font-semibold">Add a question</h3>
      <label className="grid gap-1 text-sm font-medium">
        Question
        <input type="text" required value={question} onChange={(e) => setQuestion(e.target.value)} className={field} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Limit
          <select value={unit} onChange={(e) => setUnit(e.target.value as LimitUnit | "")} className={field}>
            <option value="">No limit</option>
            <option value="WORDS">Words</option>
            <option value="CHARS">Characters</option>
          </select>
        </label>
        {unit !== "" && (
          <label className="grid gap-1 text-sm font-medium">
            Limit number
            <input type="number" min={1} step={1} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} className={`${field} w-32`} />
          </label>
        )}
      </div>
      <Button type="submit" disabled={pending || question.trim() === "" || !limitOk} className="justify-self-start">
        Add question
      </Button>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

function MarkApplied({ applicationId, stage, apply }: { applicationId: string; stage: string; apply: Apply }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const mark = () =>
    start(async () => {
      const result = await markApplied(applicationId);
      setError(result.ok ? "" : result.message);
    });
  const sent = apply.submission;
  return (
    <section aria-labelledby="applied-heading" className="grid gap-3 border-t border-border pt-6">
      <h2 id="applied-heading" className="text-lg font-semibold">Mark as applied</h2>
      <p className="text-sm text-muted-foreground">CoreEx records what you sent; it never submits the form for you.</p>
      {sent ? (
        <>
          <p className="text-sm">Marked as applied on {formatDay(sent.sentAt)}.</p>
          <ul className="grid gap-2">
            {sent.answers.map((a, index) => (
              <li key={index} className="grid gap-1 rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{a.question}</p>
                <p className="whitespace-pre-wrap">{a.answer}</p>
                <p className="text-muted-foreground">{`${a.count} ${noun(unitOf(a.limitUnit), a.count)}`}</p>
              </li>
            ))}
          </ul>
        </>
      ) : stage === "SAVED" ? (
        <>
          {apply.blockers.length > 0 && (
            <div className="grid gap-1 text-sm">
              <p className="font-medium">Fix these before you mark it as applied:</p>
              <ul className="list-disc pl-5">
                {apply.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <Button type="button" disabled={pending} onClick={mark} className="justify-self-start">Mark as applied</Button>
          {error && <Alert>{error}</Alert>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Only a Saved Application can be marked as applied.</p>
      )}
    </section>
  );
}
