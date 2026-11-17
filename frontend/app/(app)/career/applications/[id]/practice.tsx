"use client";

import { useId, useState, useTransition, type FormEvent } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatDay } from "@/lib/applications";

import { OutOfDate } from "./apply-question";
import { runPractice } from "./interview-actions";

type Library = components["schemas"]["Library"];

const ANSWER_MAX = 5000;
const QUESTION_MAX = 500;
const field = "h-9 rounded-lg border border-border bg-surface px-3";
const preview = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

// The Practice tab: answer an interview question in your own words and get feedback quoted from that answer.
// The question lives in the Workspace, so the Interview prep tab can fill it in.
export function PracticePanel({
  applicationId,
  library,
  question,
  onQuestion,
}: {
  applicationId: string;
  library: Library;
  question: string;
  onQuestion: (question: string) => void;
}) {
  const id = useId();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const attempts = library.results.filter((r) => r.kind === "PRACTICE" && r.practice);
  const [latest, ...earlier] = attempts;
  const suggestions = library.results.find((r) => r.kind === "PREP")?.prep.practice ?? [];
  const ready = question.trim() !== "" && answer.trim() !== "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    start(async () => {
      const result = await runPractice(applicationId, question.trim(), answer);
      setError(result.ok ? "" : result.message);
    });
  };

  return (
    <section aria-labelledby="practice-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="practice-heading" className="text-lg font-semibold">Practice</h2>
        <p className="text-sm text-muted-foreground">Answer an interview question in your own words, then get feedback on it.</p>
      </div>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-1">
          <label htmlFor={`${id}-question`} className="text-sm font-medium">Practice question</label>
          <input
            id={`${id}-question`}
            type="text"
            value={question}
            maxLength={QUESTION_MAX}
            list={`${id}-suggestions`}
            onChange={(e) => onQuestion(e.target.value)}
            className={field}
          />
          <datalist id={`${id}-suggestions`}>
            {suggestions.map((q, index) => (
              <option key={index} value={q} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-answer`} className="text-sm font-medium">Your answer</label>
          <textarea
            id={`${id}-answer`}
            value={answer}
            maxLength={ANSWER_MAX}
            aria-describedby={`${id}-count`}
            onChange={(e) => setAnswer(e.target.value)}
            className="min-h-40 rounded-lg border border-border bg-surface p-3"
          />
          <p id={`${id}-count`} aria-live="polite" className="text-sm text-muted-foreground">
            {`${answer.length} of ${ANSWER_MAX} characters`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || !ready} aria-describedby={`${id}-sends`}>
            {pending ? "Getting feedback…" : "Get feedback"}
          </Button>
          <p id={`${id}-sends`} className="text-sm text-muted-foreground">{library.sends.PRACTICE}</p>
        </div>
      </form>
      {error && <Alert>{error}</Alert>}
      {latest && (
        <div className="grid gap-3">
          {latest.outOfDate && <OutOfDate />}
          <h3 className="font-semibold">What works</h3>
          {latest.practice.works.length === 0 ? (
            <p className="text-sm">No exact quotes could be checked.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {latest.practice.works.map((w, index) => (
                <li key={index}>
                  <q>{w.quote}</q> {w.why}
                </li>
              ))}
            </ul>
          )}
          <h3 className="font-semibold">To strengthen</h3>
          <p className="whitespace-pre-wrap text-sm">{latest.practice.strengthen}</p>
        </div>
      )}
      {earlier.length > 0 && (
        <section aria-labelledby={`${id}-earlier`} className="grid gap-2 border-t border-border pt-4">
          <h3 id={`${id}-earlier`} className="font-semibold">Earlier attempts</h3>
          <ul className="grid gap-2">
            {earlier.map((r) => (
              <li key={r.id} className="grid gap-1 rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{r.practice.question}</p>
                <p className="text-muted-foreground">{preview(r.practice.answer)}</p>
                <p className="text-muted-foreground">{formatDay(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
