"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { closeReasonLabel, CLOSE_REASONS, formatDay, STAGES, type CloseReason, type Stage } from "@/lib/applications";

import { moveApplicationStage, saveApplication, type SaveResult } from "../actions";
import { Timeline } from "./timeline";

type Application = components["schemas"]["ApplicationResponse"];

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

export function ApplicationView({ initial }: { initial: Application }) {
  const [application, setApplication] = useState(initial);
  const [fields, setFields] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A save or a move answers with the stored Application, which becomes the new starting point for both.
  function settle(result: SaveResult) {
    if (result.status === "saved") {
      setApplication(result.application);
      setFields(result.application);
      setProblem(null);
    } else if (result.status === "conflict") {
      setProblem("This Application was changed somewhere else. Reload the page to see the latest, then try again.");
    } else {
      setProblem(result.message);
    }
  }

  const dirty = (["title", "company", "role", "location", "postingUrl", "postingText"] as const).some(
    (key) => fields[key] !== application[key],
  );
  const set = (key: "title" | "company" | "role" | "location" | "postingUrl" | "postingText") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields({ ...fields, [key]: e.target.value });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => settle(await saveApplication(application.id, { ...fields, version: application.version })));
  };
  const [movedOn, setMovedOn] = useState("");
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState<CloseReason>("NOT_SELECTED");
  const move = (stage: Stage, closeReason?: CloseReason) =>
    start(async () => {
      const result = await moveApplicationStage(application.id, stage, application.version, closeReason, movedOn);
      if (result.status === "saved") {
        setClosing(false);
        setMovedOn("");
      }
      settle(result);
    });
  // Anything else on the timeline goes through the same pending state and conflict handling.
  const run = (call: () => Promise<SaveResult>) => start(async () => settle(await call()));

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{application.title}</h1>
        {application.appliedOn && (
          <p className="text-muted-foreground">Applied {formatDay(application.appliedOn)}</p>
        )}
        {application.closeReason && (
          <p className="text-muted-foreground">Closed: {closeReasonLabel(application.closeReason)}</p>
        )}
      </header>

      {problem && <Alert>{problem}</Alert>}

      <section aria-labelledby="stage-heading" className="grid gap-2">
        <h2 id="stage-heading" className="text-sm font-medium">
          Stage
        </h2>
        <ol className="flex flex-wrap gap-2">
          {STAGES.map(({ stage, label }) => (
            <li key={stage}>
              <Button
                type="button"
                size="sm"
                variant={application.stage === stage ? "default" : "outline"}
                aria-current={application.stage === stage ? "step" : undefined}
                disabled={pending}
                onClick={() => (stage === "CLOSED" ? setClosing(true) : move(stage))}
              >
                {label}
              </Button>
            </li>
          ))}
        </ol>
        {closing && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Why did it close?
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as CloseReason)}
                className="h-9 rounded-lg border border-border bg-surface px-3"
              >
                {CLOSE_REASONS.map(({ reason: value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" size="sm" disabled={pending} onClick={() => move("CLOSED", reason)}>
              Close Application
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setClosing(false)}>
              Cancel
            </Button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          Moved on
          <input
            type="date"
            value={movedOn}
            onChange={(e) => setMovedOn(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3"
          />
          <span className="text-xs text-muted-foreground">Empty means today.</span>
        </label>
      </section>

      <form onSubmit={save} className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">
          Title
          <input value={fields.title} onChange={set("title")} required maxLength={200} className={input} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Company
            <input value={fields.company} onChange={set("company")} required maxLength={90} className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Role
            <input value={fields.role} onChange={set("role")} required maxLength={90} className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Location
            <input value={fields.location} onChange={set("location")} maxLength={200} className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Posting link
            <input
              value={fields.postingUrl}
              onChange={set("postingUrl")}
              type="url"
              maxLength={2000}
              placeholder="https://"
              className={input}
            />
          </label>
        </div>
        <div className="grid gap-1">
          <label htmlFor="posting-text" className="text-sm font-medium">
            Posting
          </label>
          <textarea
            id="posting-text"
            value={fields.postingText}
            onChange={set("postingText")}
            rows={10}
            maxLength={100000}
            className="rounded-lg border border-border bg-surface px-3 py-2"
          />
        </div>
        <div>
          <Button type="submit" disabled={!dirty || pending}>
            Save
          </Button>
        </div>
      </form>

      <Timeline application={application} run={run} pending={pending} />
    </div>
  );
}
