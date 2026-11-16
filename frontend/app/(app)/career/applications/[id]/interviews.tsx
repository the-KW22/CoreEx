"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import {
  formatDate,
  formatLocal,
  INTERVIEW_KINDS,
  interviewLabel,
  toInstant,
  toLocalInput,
  type InterviewKind,
} from "@/lib/applications";

import { deleteTimelineEntry, saveInterview, saveReminder, type SaveResult } from "../actions";

type Application = components["schemas"]["ApplicationResponse"];
type Entry = Application["timeline"][number];

const input = "h-9 rounded-lg border border-border bg-surface px-3";
const noop = () => () => {};

// True once the page runs in the browser. Local times depend on the browser's timezone, which the server render
// cannot know, so they are drawn only after this.
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

type Run = (call: () => Promise<SaveResult>) => void;

// The interviews and the one follow-up reminder. `run` sends a change through the page's pending state and conflict
// handling.
export function Interviews({ application, run, pending }: { application: Application; run: Run; pending: boolean }) {
  const hydrated = useHydrated();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const interviews = application.timeline.filter((e) => e.type === "INTERVIEW").sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section aria-labelledby="interviews-heading" className="grid gap-3">
      <h2 id="interviews-heading" className="text-sm font-medium">
        Interviews
      </h2>
      {hydrated && (
        <ul className="grid gap-2 text-sm">
          {interviews.map((interview) => (
            <li key={interview.seq}>
              {editing === interview.seq ? (
                <InterviewForm
                  initial={interview}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(value) =>
                    run(async () => {
                      const result = await saveInterview(application.id, interview.seq, value, application.version);
                      if (result.status === "saved") setEditing(null);
                      return result;
                    })
                  }
                />
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span>{formatLocal(interview.at)}</span>
                  <span className="text-muted-foreground">{interviewLabel(interview.kind)}</span>
                  {interview.text && <span className="whitespace-pre-wrap break-words">{interview.text}</span>}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Edit interview: ${formatLocal(interview.at)}`}
                    onClick={() => setEditing(interview.seq)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Remove interview: ${formatLocal(interview.at)}`}
                    onClick={() => run(() => deleteTimelineEntry(application.id, interview.seq, application.version))}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing === "new" ? (
        <InterviewForm
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(value) =>
            run(async () => {
              const result = await saveInterview(application.id, null, value, application.version);
              if (result.status === "saved") setEditing(null);
              return result;
            })
          }
        />
      ) : (
        <div>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing("new")}>
            Add interview
          </Button>
        </div>
      )}
      <Reminder application={application} run={run} pending={pending} />
    </section>
  );
}

function InterviewForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: Entry;
  pending: boolean;
  onCancel: () => void;
  onSave: (value: { startsAt: string; kind: InterviewKind; notes: string }) => void;
}) {
  const [when, setWhen] = useState(initial ? toLocalInput(initial.at) : "");
  const [kind, setKind] = useState<InterviewKind>((initial?.kind as InterviewKind | null) ?? "PHONE");
  const [notes, setNotes] = useState(initial?.text ?? "");

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ startsAt: toInstant(when), kind, notes });
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          Interview time
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className={input} />
        </label>
        <label className="flex items-center gap-2">
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as InterviewKind)} className={input}>
            {INTERVIEW_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        aria-label="Interview notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder="Notes"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !when}>
          Save interview
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Reminder({ application, run, pending }: { application: Application; run: Run; pending: boolean }) {
  const [on, setOn] = useState(application.reminderOn ?? "");
  const [time, setTime] = useState(application.reminderTime?.slice(0, 5) ?? "");
  const saved = application.reminderOn;

  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <h3 className="text-sm font-medium">Follow-up reminder</h3>
      <p className="text-sm text-muted-foreground">
        {saved
          ? `Follow up on ${formatDate(saved)}${application.reminderTime ? ` at ${application.reminderTime.slice(0, 5)}` : " (09:00 unless you set a time)"}.`
          : "No reminder set."}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          Reminder date
          <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className={input} />
        </label>
        <label className="flex items-center gap-2">
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!on} className={input} />
        </label>
        <Button
          type="button"
          size="sm"
          disabled={pending || !on}
          onClick={() => run(() => saveReminder(application.id, on, time, application.version))}
        >
          Set reminder
        </Button>
        {saved && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await saveReminder(application.id, "", "", application.version);
                if (result.status === "saved") {
                  setOn("");
                  setTime("");
                }
                return result;
              })
            }
          >
            Clear reminder
          </Button>
        )}
      </div>
    </div>
  );
}
