"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { linkedChoices, setLinkedDocument } from "./linked-actions";

type LinkedApplication = components["schemas"]["LinkedApplication"];

export function DocumentApplications({ id, kind, initial }: { id: string; kind: "RESUME" | "COVER_LETTER"; initial: LinkedApplication[] }) {
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof linkedChoices>> | undefined>();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { void linkedChoices().then(setChoices).catch(() => setChoices(null)); }, []);
  return <section aria-labelledby="document-applications" className="grid gap-2">
    <h2 id="document-applications" className="text-sm font-medium">Applications</h2>
    {initial.length > 0 && <ul className="grid gap-1 text-sm">{initial.map((item) => <li key={item.id}><Link href={`/career/applications/${item.id}`} className="underline underline-offset-2">{item.title}</Link>{item.sent ? " · Sent" : ""}</li>)}</ul>}
    {choices === undefined ? <p className="text-sm">Loading Applications…</p> : choices === null ? <p role="alert">Could not load Applications.</p> : <>
      <label className="grid gap-1 text-sm font-medium">Link to Application<select value={selected} onChange={(e) => setSelected(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3"><option value="">Choose an Application</option>{choices.applications.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <Button type="button" size="sm" variant="outline" disabled={!selected || pending} onClick={() => start(async () => {
        const result = await setLinkedDocument(selected, kind, id);
        setError(result === "ok" ? "" : result === "sent" ? "This Application already has a linked or sent document. Open it to review the link." : "Could not link the Application. Try again.");
        if (result === "ok") setSelected("");
      })}>Link</Button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
