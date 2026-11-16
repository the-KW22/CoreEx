"use client";

import { HistoryIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { listVersions, renameVersion, type VersionSummary } from "./actions";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// History mode: the documents the Resume's saves replaced (newest 50 for 90 days) and the ones you named, which are
// kept for good. Choosing one shows it in the page preview; Restore saves it as the Resume and keeps what it replaces.
export function History({
  id,
  locked,
  busy,
  viewing,
  refresh,
  onView,
  onRestore,
  onNameCurrent,
}: {
  id: string;
  locked: boolean;
  busy: boolean;
  viewing: string | null;
  // Changes when the list may have changed (a restore, a save of a name), so it is read again.
  refresh: number;
  onView: (versionId: string | null) => void;
  onRestore: (versionId: string) => void;
  onNameCurrent: (name: string) => Promise<boolean>;
}) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [rename, setRename] = useState("");
  const [message, setMessage] = useState("");

  // Bumped after a change made here, so the list is read again like when `refresh` changes.
  const [again, setAgain] = useState(0);
  const load = () => setAgain((n) => n + 1);

  useEffect(() => {
    let current = true;
    void listVersions(id).then((list) => {
      if (!current) return;
      setFailed(list === null);
      setVersions(list);
    });
    return () => {
      current = false;
    };
  }, [id, refresh, again]);

  const current = versions?.find((v) => v.id === viewing) ?? null;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (await onNameCurrent(name.trim())) {
      setName("");
      load();
    } else {
      setMessage("Could not keep a named version. Try again.");
    }
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setMessage("");
    if (await renameVersion(id, current.id, rename.trim())) load();
    else setMessage("Could not change the name. Try again.");
  }

  return (
    <section aria-labelledby="history" className="grid gap-4">
      <div>
        <h2 id="history" className="flex items-center gap-2 text-lg font-semibold">
          <HistoryIcon aria-hidden className="size-5" />
          History
        </h2>
        <p className="text-sm text-muted-foreground">
          Earlier versions are kept as you save: the newest 50, for 90 days. A version you name is kept for good.
        </p>
      </div>

      <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
          Name this version
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Sent to Acme" className={input} />
        </label>
        <Button type="submit" variant="outline" disabled={busy || name.trim() === ""}>
          Keep as a named version
        </Button>
      </form>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Could not load the history. Try again.
        </p>
      )}
      {versions && versions.length === 0 && <p className="text-sm text-muted-foreground">No earlier versions yet. They appear as you save.</p>}
      {versions && versions.length > 0 && (
        <ul className="grid gap-2" aria-label="Versions">
          {versions.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                aria-pressed={viewing === v.id}
                onClick={() => {
                  onView(viewing === v.id ? null : v.id);
                  setRename(v.name ?? "");
                }}
                className={cn("grid w-full gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-surface", viewing === v.id && "border-link bg-surface")}
              >
                <span className="font-medium">{v.name ?? when(v.savedAt)}</span>
                <span className="text-sm text-muted-foreground">
                  {v.name ? `${when(v.savedAt)} · ` : ""}
                  {v.title}
                  {v.editedBy ? ` · by ${v.editedBy}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <div className="grid gap-3 rounded-lg border border-border p-3">
          <p role="status" className="text-sm">
            Looking at {current.name ? `“${current.name}”` : when(current.savedAt)} in the page preview. Your Resume has not changed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={locked || busy} onClick={() => onRestore(current.id)}>
              Restore this version
            </Button>
            <Button type="button" variant="outline" onClick={() => onView(null)}>
              Stop looking
            </Button>
          </div>
          {locked && <p className="text-sm text-muted-foreground">Unlock the Resume to restore a version.</p>}
          <form onSubmit={saveRename} className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
              Name of this version
              <input value={rename} maxLength={120} onChange={(e) => setRename(e.target.value)} className={input} />
            </label>
            <Button type="submit" variant="outline">
              Save name
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
