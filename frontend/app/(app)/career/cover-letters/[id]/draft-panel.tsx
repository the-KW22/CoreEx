"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { parseRich } from "@/lib/resume/html";
import { acceptLetterDraft, draftChoices, letterDrafts, makeLetterDraft } from "./actions";

type Letter = components["schemas"]["Letter"];
type Draft = NonNullable<Awaited<ReturnType<typeof letterDrafts>>>[number];
type Mode = components["schemas"]["DraftCoverLetter"]["mode"];

const plain = (html: string) => parseRich(html).map((block) => block.kind === "paragraph" ? block.runs.map((r) => r.text).join("") : block.items.map((item) => item.map((r) => r.text).join("")).join("\n")).join("\n\n");

export function DraftPanel({ id, version, ready, linkedResume, onAccept }: { id: string; version: number; ready: boolean; linkedResume: string | null; onAccept: (letter: Letter) => void }) {
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof draftChoices>> | undefined>();
  const [history, setHistory] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [application, setApplication] = useState("");
  const [resume, setResume] = useState(linkedResume ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { void draftChoices().then(setChoices).catch(() => setChoices(null)); void letterDrafts(id).then((items) => { if (items) setHistory(items); }); }, [id]);

  function generate(mode: Mode) {
    setError("");
    start(async () => {
      const result = await makeLetterDraft(id, { applicationId: application, resumeId: resume, version, mode, draftId: mode === "DRAFT" ? undefined : selected?.id });
      if (result.status === "ok") { setSelected(result.draft); setHistory((current) => [result.draft, ...current]); }
      else setError(result.status === "budget" ? "You have used today's AI budget. It starts again at midnight UTC." : result.status === "conflict" ? "A source changed. Reload and try again." : "Could not make a draft. Try again.");
    });
  }

  function accept() {
    if (!selected) return;
    setError("");
    start(async () => {
      const result = await acceptLetterDraft(id, selected.id, version);
      if (result.status === "saved") { onAccept(result.letter); setSelected(null); }
      else setError(result.status === "conflict" ? "The letter or a source changed. Reload and make a new draft." : "Could not apply the draft. Try again.");
    });
  }

  return <section aria-labelledby="draft-heading" className="grid gap-3 border-t border-border pt-4">
    <h2 id="draft-heading" className="text-lg font-semibold">Draft with AI</h2>
    <p className="text-sm text-muted-foreground">Sends: the selected Application posting, Resume and current draft to the configured AI model. Review every suggestion before using it.</p>
    {choices === undefined ? <p>Loading…</p> : choices === null ? <p role="alert">Could not load Applications and Resumes.</p> : <>
      <label className="grid gap-1 text-sm font-medium">Application<select value={application} onChange={(e) => setApplication(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3"><option value="">Choose an Application</option>{choices.applications.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">Resume<select value={resume} onChange={(e) => setResume(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3"><option value="">Choose a Resume</option>{choices.resumes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!ready || pending || !application || !resume} onClick={() => generate("DRAFT")}>Draft</Button>
        <Button type="button" variant="outline" disabled={!ready || pending || !application || !resume} onClick={() => generate("SHORTER")}>Shorter</Button>
        <Button type="button" variant="outline" disabled={!ready || pending || !application || !resume} onClick={() => generate("PERSONAL")}>More personal</Button>
      </div>
      {!ready && <p className="text-sm text-muted-foreground">Save changes before using AI.</p>}
    </>}
    {pending && <p role="status">Working…</p>}
    {error && <p role="alert">{error}</p>}
    {selected && <div className="grid gap-3 rounded-lg border border-border p-3">
      <h3 className="font-semibold">Suggestion</h3>
      <p className="whitespace-pre-wrap">{plain(selected.body)}</p>
      {(selected.stale || selected.baseVersion !== version) && <p role="status">The source has changed; make a new draft.</p>}
      <div className="flex gap-2"><Button type="button" disabled={!ready || pending || selected.stale || selected.baseVersion !== version} onClick={accept}>Accept</Button><Button type="button" variant="outline" onClick={() => setSelected(null)}>Reject</Button></div>
    </div>}
    {history.length > 0 && <details><summary>Previous drafts</summary><ul className="grid gap-2">{history.map((draft) => <li key={draft.id}><Button type="button" variant="ghost" onClick={() => setSelected(draft)}>{draft.mode === "DRAFT" ? "Draft" : draft.mode === "SHORTER" ? "Shorter" : "More personal"}{draft.stale || draft.baseVersion !== version ? " · Out of date" : ""}</Button></li>)}</ul></details>}
  </section>;
}
