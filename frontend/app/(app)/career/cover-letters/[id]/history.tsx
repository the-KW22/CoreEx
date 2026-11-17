"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { parseRich } from "@/lib/resume/html";
import { letterVersion, letterVersions, nameLetterVersion, restoreLetterVersion } from "./actions";

type Letter = components["schemas"]["Letter"];
type Version = NonNullable<Awaited<ReturnType<typeof letterVersions>>>[number];

export function LetterHistory({ id, version, ready, onRestore }: { id: string; version: number; ready: boolean; onRestore: (letter: Letter) => void }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Record<string, components["schemas"]["CoverLetterDocument"]>>({});
  const [pending, start] = useTransition();
  async function refresh() { const found = await letterVersions(id); setVersions(found); setLoading(false); }
  useEffect(() => { void letterVersions(id).then((found) => { setVersions(found); setLoading(false); }); }, [id]);
  return <section aria-labelledby="letter-history" className="grid content-start gap-4">
    <h2 id="letter-history" className="text-lg font-semibold">Version history</h2>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); start(async () => {
      if (await nameLetterVersion(id, name)) { setName(""); setError(""); await refresh(); }
      else setError("Could not name this version. Try again.");
    }); }}>
      <label className="grid gap-1 text-sm font-medium">Version name<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3" /></label>
      <Button type="submit" variant="outline" size="sm" disabled={!ready || pending || !name.trim()}>Keep named version</Button>
    </form>
    {loading ? <p>Loading versions…</p> : versions === null ? <p role="alert">Could not load versions.</p> : versions.length === 0 ? <p>No earlier versions yet.</p> : <ul className="grid gap-3">
      {versions.map((entry) => entry.id && <li key={entry.id} className="grid gap-2 rounded-lg border border-border p-3">
        <p className="font-medium">{entry.name || entry.title || "Earlier version"}{entry.savedAt ? ` · ${new Date(entry.savedAt).toLocaleString()}` : ""}</p>
        <details onToggle={(event) => { if (event.currentTarget.open && entry.id && !preview[entry.id]) start(async () => {
          const found = await letterVersion(id, entry.id!);
          if (found?.document) setPreview((current) => ({ ...current, [entry.id!]: found.document! }));
          else setError("Could not load this version.");
        }); }}><summary>Preview</summary><p className="whitespace-pre-wrap text-sm">{parseRich(preview[entry.id]?.body ?? "").map((block) => block.kind === "paragraph" ? block.runs.map((run) => run.text).join("") : block.items.map((item) => item.map((run) => run.text).join("")).join("\n")).join("\n\n")}</p></details>
        <Button type="button" variant="outline" size="sm" disabled={!ready || pending} onClick={() => start(async () => {
          const result = await restoreLetterVersion(id, entry.id!, version);
          if (result.status === "saved") { onRestore(result.letter); setError(""); await refresh(); }
          else setError(result.status === "conflict" ? "The letter changed elsewhere. Reload before restoring." : "Could not restore this version.");
        })}>Restore this version</Button>
      </li>)}
    </ul>}
    {!ready && <p className="text-sm text-muted-foreground">Save changes before using version history.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
