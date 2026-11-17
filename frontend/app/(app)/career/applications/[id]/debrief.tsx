"use client";

import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatLocal, interviewLabel } from "@/lib/applications";

import { OutOfDate } from "./apply-question";
import { runDebriefSummary, saveDebrief } from "./interview-actions";
import { useHydrated } from "./interviews";

type Library = components["schemas"]["Library"];
type Entry = components["schemas"]["TimelineEntryResponse"];
type Debrief = components["schemas"]["DebriefResponse"];
type Asked = components["schemas"]["AskedBody"];

const MAX_QUESTIONS = 30;
const field = "h-9 rounded-lg border border-border bg-surface px-3";
const LANDED = [
  { value: "WELL", label: "Went well" },
  { value: "MIXED", label: "Mixed" },
  { value: "POORLY", label: "Went poorly" },
];

// The Debrief tab: notes on each interview, the questions asked and how they landed, and a summary of what to improve.
export function DebriefPanel({
  applicationId,
  library,
  timeline,
  debriefs,
}: {
  applicationId: string;
  library: Library;
  timeline: Entry[];
  debriefs: Debrief[];
}) {
  const hydrated = useHydrated();
  const interviews = timeline.filter((e) => e.type === "INTERVIEW").sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section aria-labelledby="debrief-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="debrief-heading" className="text-lg font-semibold">Debrief</h2>
        <p className="text-sm text-muted-foreground">Write down how each interview went, then ask for what to improve.</p>
      </div>
      {interviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add an interview in Details first.</p>
      ) : (
        // Local times are drawn only after hydration; the list waits for it.
        hydrated &&
        interviews.map((entry) => {
          const saved = debriefs.find((d) => d.interviewSeq === entry.seq);
          // Keyed by version, so a saved Debrief reloads its new values.
          return <DebriefSection key={`${entry.seq}-${saved?.version ?? 0}`} applicationId={applicationId} entry={entry} saved={saved} library={library} />;
        })
      )}
    </section>
  );
}

function DebriefSection({
  applicationId,
  entry,
  saved,
  library,
}: {
  applicationId: string;
  entry: Entry;
  saved: Debrief | undefined;
  library: Library;
}) {
  const id = useId();
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const [questions, setQuestions] = useState<Asked[]>(saved?.questions ?? []);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const summary = library.results.find((r) => r.kind === "DEBRIEF" && r.summary.interviewSeq === entry.seq);

  const update = (index: number, patch: Partial<Asked>) =>
    setQuestions((list) => list.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  const save = () =>
    start(async () => {
      const result = await saveDebrief(applicationId, entry.seq, { notes, questions, version: saved?.version });
      setError(result.ok ? "" : result.message);
    });

  const summarise = () =>
    start(async () => {
      const result = await runDebriefSummary(applicationId, entry.seq);
      setError(result.ok ? "" : result.message);
    });

  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-4 rounded-lg border border-border p-4">
      <h3 id={`${id}-heading`} className="font-semibold">
        {`${interviewLabel(entry.kind)}, ${formatLocal(entry.at)}`}
      </h3>
      <div className="grid gap-1">
        <label htmlFor={`${id}-notes`} className="text-sm font-medium">Notes</label>
        <textarea
          id={`${id}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-24 rounded-lg border border-border bg-surface p-3 text-sm"
        />
      </div>
      <div className="grid gap-3">
        <h4 className="text-sm font-semibold">Questions asked</h4>
        {questions.map((q, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-border p-3 text-sm">
            <div className="grid gap-1">
              <label htmlFor={`${id}-q${index}`} className="font-medium">Question</label>
              <input id={`${id}-q${index}`} type="text" value={q.question} onChange={(e) => update(index, { question: e.target.value })} className={field} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <label htmlFor={`${id}-l${index}`} className="font-medium">How it landed</label>
                <select id={`${id}-l${index}`} value={q.landed} onChange={(e) => update(index, { landed: e.target.value })} className={field}>
                  {LANDED.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-48 flex-1 gap-1">
                <label htmlFor={`${id}-n${index}`} className="font-medium">Note</label>
                <input id={`${id}-n${index}`} type="text" value={q.note} onChange={(e) => update(index, { note: e.target.value })} className={field} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setQuestions((list) => list.filter((_, i) => i !== index))}
              >
                Remove question
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || questions.length >= MAX_QUESTIONS}
          onClick={() => setQuestions((list) => [...list, { question: "", landed: "WELL", note: "" }])}
          className="justify-self-start"
        >
          Add question
        </Button>
      </div>
      <Button type="button" disabled={pending} onClick={save} className="justify-self-start">
        Save Debrief
      </Button>
      {error && <Alert>{error}</Alert>}
      {saved && (
        <div className="grid gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={summarise} aria-describedby={`${id}-sends`}>
              {summary ? "Summarise again" : "Summarise what to improve"}
            </Button>
            <p id={`${id}-sends`} className="text-sm text-muted-foreground">{library.sends.DEBRIEF}</p>
          </div>
          {summary && (
            <div className="grid gap-2">
              <h4 className="text-sm font-semibold">What to improve</h4>
              {summary.outOfDate && <OutOfDate />}
              <ul className="grid list-disc gap-1 pl-5 text-sm">
                {summary.summary.improve.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
