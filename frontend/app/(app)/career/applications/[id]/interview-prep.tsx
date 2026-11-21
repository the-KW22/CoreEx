"use client";

import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatLocal, interviewLabel } from "@/lib/applications";

import { OutOfDate } from "./apply-question";
import { runPrep } from "./interview-actions";
import { useHydrated } from "./interviews";

type Library = components["schemas"]["Library"];
type Result = components["schemas"]["ResultResponse"];
type Entry = components["schemas"]["TimelineEntryResponse"];

const EVIDENCE: Record<string, string> = { FACT: "Fact", STORY: "Story" };
const select = "h-9 rounded-lg border border-border bg-surface px-3";

// The Interview prep tab: a plan for an upcoming interview, drawn from the posting and the User's Knowledge.
export function InterviewPrep({
  applicationId,
  library,
  timeline,
  onPractise,
}: {
  applicationId: string;
  library: Library;
  timeline: Entry[];
  onPractise?: (question: string) => void;
}) {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const sendsId = useId();

  // "Upcoming" depends on the browser's clock, so nothing is listed before hydration.
  const upcoming = hydrated
    ? timeline.filter((e) => e.type === "INTERVIEW" && Date.parse(e.at) > now).sort((a, b) => a.at.localeCompare(b.at))
    : [];
  const interview = upcoming.find((e) => e.seq === chosen) ?? upcoming[0];
  const latest = interview ? library.results.find((r) => r.kind === "PREP" && r.prep.interviewSeq === interview.seq) : undefined;

  const run = () => {
    if (!interview) return;
    start(async () => {
      const result = await runPrep(applicationId, interview.seq);
      setError(result.ok ? "" : result.message);
    });
  };

  return (
    <section aria-labelledby="prep-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="prep-heading" className="text-lg font-semibold">Interview prep</h2>
        <p className="text-sm text-muted-foreground">A plan for an upcoming interview, from the posting and your Knowledge.</p>
      </div>
      {hydrated &&
        (interview === undefined ? (
          <p className="text-sm text-muted-foreground">Add an upcoming interview in Details first.</p>
        ) : (
          <>
            {upcoming.length > 1 && (
              <label className="grid justify-items-start gap-1 text-sm font-medium">
                Interview
                <select value={interview.seq} onChange={(e) => setChosen(Number(e.target.value))} className={select}>
                  {upcoming.map((e) => (
                    <option key={e.seq} value={e.seq}>
                      {`${formatLocal(e.at)}, ${interviewLabel(e.kind)}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={pending} onClick={run} aria-describedby={sendsId}>
                {pending ? "Preparing…" : latest ? "Prepare again" : "Prepare for interview"}
              </Button>
              <p id={sendsId} className="text-sm text-muted-foreground">{library.sends.PREP}</p>
            </div>
            {error && <Alert>{error}</Alert>}
            {latest && <PrepResult result={latest} onPractise={onPractise} />}
          </>
        ))}
    </section>
  );
}

function PrepResult({ result, onPractise }: { result: Result; onPractise?: (question: string) => void }) {
  const prep = result.prep;
  return (
    <div className="grid gap-4">
      {result.outOfDate && <OutOfDate />}
      <div className="grid gap-2">
        <h3 className="font-semibold">Plan</h3>
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          {prep.plan.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="grid gap-1">
        <h3 className="font-semibold">About the role</h3>
        <p className="whitespace-pre-wrap text-sm">{prep.about}</p>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">What to stress</h3>
        <ul className="grid gap-2">
          {prep.stress.map((s, index) => (
            <li key={index} className="grid gap-1 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{s.point}</p>
              <ul className="grid gap-1">
                {s.evidence.map((e) => (
                  <li key={e.id}>
                    <span className="text-muted-foreground">{EVIDENCE[e.kind] ?? "Resume"}: </span>
                    <q>{e.label}</q>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Questions to ask</h3>
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          {prep.ask.map((q, index) => (
            <li key={index}>{q}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Practice questions</h3>
        <ul className="grid gap-2">
          {prep.practice.map((q, index) => (
            <li key={index} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{q}</span>
              {/* The Practice tab is hidden (#366), so the button waits for it. */}
              {onPractise && (
                <Button type="button" size="sm" variant="outline" onClick={() => onPractise(q)}>
                  Practise<span className="sr-only"> {q}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
