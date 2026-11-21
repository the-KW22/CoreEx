"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { copyResumeForJob, linkedChoices, setLinkedDocument } from "../../linked-actions";

type Linked = components["schemas"]["LinkedDocument"];

export function LinkedDocuments({ applicationId, initial }: { applicationId: string; initial: Linked[] }) {
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof linkedChoices>> | undefined>();
  const [selection, setSelection] = useState<Record<string, string>>(() => Object.fromEntries(initial.map((item) => [item.kind, item.itemId ?? ""])));
  const [copy, setCopy] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const request = useRef<string | null>(null);
  useEffect(() => { void linkedChoices().then(setChoices).catch(() => setChoices(null)); }, []);

  return <section aria-labelledby="linked-documents" className="grid gap-3">
    <h2 id="linked-documents" className="text-sm font-medium">Resumes and Cover Letters</h2>
    {choices === undefined ? <p>Loading documents…</p> : choices === null ? <p role="alert">Could not load documents.</p> : <>
      {(["RESUME", "COVER_LETTER"] as const).map((kind) => {
        const label = kind === "RESUME" ? "Resume" : "Cover Letter";
        const linked = initial.find((item) => item.kind === kind);
        const options = kind === "RESUME" ? choices.resumes : choices.letters;
        return <div key={kind} className="grid gap-2 rounded-lg border border-border p-3">
          <label className="grid gap-1 text-sm font-medium">{label}<select value={selection[kind] ?? ""} disabled={pending || !!linked?.sentAt} onChange={(e) => setSelection((current) => ({ ...current, [kind]: e.target.value }))} className="h-9 rounded-lg border border-border bg-surface px-3">
            <option value="">None</option>{options.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          {linked?.sentAt ? <div className="grid gap-2 text-sm"><p>Sent: {linked.sentTitle}{linked.checkScore !== null ? ` · Check ${linked.checkScore}/100` : ""}</p>
            <details><summary>What you sent</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(linked.sentDocument, null, 2)}</pre></details>
            {linked.itemId && <Link className="underline underline-offset-2" href={`${kind === "RESUME" ? "/career/resumes" : "/career/cover-letters"}/${linked.itemId}`}>Open current {label}</Link>}
          </div> : <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
            const result = await setLinkedDocument(applicationId, kind, selection[kind] || null, true);
            setError(result === "ok" ? "" : result === "sent" ? "A sent document cannot be changed." : "Could not link the document. Try again.");
          })}>Save {label} link</Button>}
        </div>;
      })}
      <label className="grid gap-1 text-sm font-medium">Copy a Resume for this job<select value={copy} onChange={(e) => { setCopy(e.target.value); request.current = null; }} className="h-9 rounded-lg border border-border bg-surface px-3"><option value="">Choose a Resume</option>{choices.cvs.map((item) => <option key={item.id} value={item.id}>CV: {item.title}</option>)}{choices.resumes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <Button type="button" variant="outline" disabled={!copy || pending || initial.some((item) => item.kind === "RESUME" && !!item.sentAt)} onClick={() => start(async () => {
        request.current ??= crypto.randomUUID();
        if (await copyResumeForJob(applicationId, copy, request.current)) { request.current = null; setCopy(""); setError(""); }
        else setError("Could not copy the Resume. Try again.");
      })}>Copy for this job</Button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
