"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatDay, stageLabel } from "@/lib/applications";

import {
  addTimelineEntry,
  deleteTimelineEntry,
  editTimelineEntry,
  type SaveResult,
} from "../actions";

type Application = components["schemas"]["ApplicationResponse"];
type Entry = Application["timeline"][number];

const input = "h-9 rounded-lg border border-border bg-surface px-3";

const describe = (entry: Entry) =>
  entry.type === "STAGE" && entry.stage
    ? `Moved to ${stageLabel(entry.stage)}`
    : entry.type === "FOLLOWED_UP"
      ? "I followed up"
      : entry.type === "REPLIED"
        ? "They replied"
        : (entry.text ?? "");

// The timeline, oldest first by its date; entries on one day keep the order they were written in. `run` sends a
// change through the page's one pending state and conflict handling.
export function Timeline({
  application,
  run,
  pending,
}: {
  application: Application;
  run: (call: () => Promise<SaveResult>) => void;
  pending: boolean;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const entries = [...application.timeline].sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);

  const add = (type: "NOTE" | "FOLLOWED_UP" | "REPLIED") => {
    run(async () => {
      const result = await addTimelineEntry(application.id, { type, text, date }, application.version);
      if (result.status === "saved") {
        setText("");
        setDate("");
      }
      return result;
    });
  };

  return (
    <section aria-labelledby="timeline-heading" className="grid gap-3">
      <h2 id="timeline-heading" className="text-sm font-medium">
        Timeline
      </h2>
      <ol className="grid gap-2 text-sm">
        {entries.map((entry) => (
          <li key={entry.seq}>
            {editing === entry.seq ? (
              <EditEntry
                entry={entry}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(change) =>
                  run(async () => {
                    const result = await editTimelineEntry(application.id, entry.seq, change, application.version);
                    if (result.status === "saved") setEditing(null);
                    return result;
                  })
                }
              />
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">{formatDay(entry.at)}</span>
                <span className="whitespace-pre-wrap break-words">{describe(entry)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Edit: ${formatDay(entry.at)} ${describe(entry)}`}
                  onClick={() => setEditing(entry.seq)}
                >
                  Edit
                </Button>
                {entry.type !== "STAGE" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Delete: ${formatDay(entry.at)} ${describe(entry)}`}
                    onClick={() => run(() => deleteTimelineEntry(application.id, entry.seq, application.version))}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="grid gap-2">
        <label htmlFor="timeline-note" className="text-sm font-medium">
          Add to the timeline
        </label>
        <textarea
          id="timeline-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="A note"
          className="rounded-lg border border-border bg-surface px-3 py-2"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <Button type="button" size="sm" disabled={pending || !text.trim()} onClick={() => add("NOTE")}>
            Add note
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => add("FOLLOWED_UP")}>
            I followed up
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => add("REPLIED")}>
            They replied
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Leave the date empty for today. It cannot be in the future.</p>
      </div>
    </section>
  );
}

// A note's text and any entry's date, changed in place. A day left as it was is not sent again.
function EditEntry({
  entry,
  pending,
  onCancel,
  onSave,
}: {
  entry: Entry;
  pending: boolean;
  onCancel: () => void;
  onSave: (change: { text?: string; date?: string }) => void;
}) {
  const [text, setText] = useState(entry.text ?? "");
  const [date, setDate] = useState(entry.at.slice(0, 10));
  const note = entry.type === "NOTE";

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ text: note ? text : undefined, date });
      }}
    >
      {note && (
        <textarea
          aria-label="Note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={5000}
          required
          className="rounded-lg border border-border bg-surface px-3 py-2"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={input} />
        </label>
        <Button type="submit" size="sm" disabled={pending || (note && !text.trim())}>
          Save entry
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
