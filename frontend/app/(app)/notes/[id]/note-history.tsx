"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { loadVersions, loadVersionText, type NoteVersion } from "../actions";
import { writtenBy } from "./history";

type Load = { status: "idle" | "loading" | "error" } | { status: "ready"; items: NoteVersion[] };

// The Note's earlier texts (docs/DESIGN.md section 6.3), in the details panel. Loaded when opened, so a Note page
// that nobody opens History on costs nothing. `onRestore` returns why the restore did not happen, or null.
export function NoteHistory({
  noteId,
  onRestore,
}: {
  noteId: string;
  onRestore: (versionId: string) => Promise<string | null>;
}) {
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // The text of the versions being previewed; null while it loads or when it could not be.
  const [previews, setPreviews] = useState<Record<string, string | null | undefined>>({});
  const [shown, setShown] = useState<string[]>([]);

  async function refresh() {
    setLoad((was) => (was.status === "ready" ? was : { status: "loading" }));
    const items = await loadVersions(noteId).catch(() => null);
    setLoad(items ? { status: "ready", items } : { status: "error" });
  }

  async function togglePreview(versionId: string) {
    const open = shown.includes(versionId);
    setShown(open ? shown.filter((id) => id !== versionId) : [...shown, versionId]);
    if (open || versionId in previews) return;
    const text = await loadVersionText(noteId, versionId).catch(() => null);
    setPreviews((was) => ({ ...was, [versionId]: text }));
  }

  async function restore(versionId: string) {
    setBusy(true);
    setMessage("");
    const problem = await onRestore(versionId).catch(() => "Cannot reach the CoreEx API.");
    setBusy(false);
    if (problem) {
      setMessage(problem);
      return;
    }
    toast.success("Restored. The text it replaced is in History.");
    await refresh();
  }

  return (
    <Collapsible onOpenChange={(open) => open && void refresh()} className="grid gap-2">
      <h2 className="text-xs font-semibold text-muted-foreground">
        <CollapsibleTrigger className="group -ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground pointer-coarse:min-h-11">
          <ChevronDownIcon aria-hidden className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
          History
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="grid gap-2">
        {load.status === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
        {load.status === "error" && (
          <p role="alert" className="text-sm">
            Could not load the History.{" "}
            <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
              Try again
            </Button>
          </p>
        )}
        {load.status === "ready" && load.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No earlier versions yet.</p>
        )}
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        {load.status === "ready" && load.items.length > 0 && (
          <ul className="grid gap-2">
            {load.items.map((version) => {
              const when = new Date(version.savedAt).toLocaleString();
              const text = previews[version.id];
              return (
                <li key={version.id} className="grid gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <time dateTime={version.savedAt} className="block">
                        {when}
                      </time>
                      <span className="block truncate text-xs text-muted-foreground">
                        {writtenBy(version.editedBy)} · {version.title || "Untitled"}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-expanded={shown.includes(version.id)}
                        aria-label={`Preview the text from ${when}`}
                        onClick={() => void togglePreview(version.id)}
                      >
                        Preview
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Restore the text from ${when}`}
                        onClick={() => void restore(version.id)}
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                  {shown.includes(version.id) &&
                    (text === undefined ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : text === null ? (
                      <p role="alert" className="text-xs">
                        Could not load that text.
                      </p>
                    ) : (
                      <pre
                        tabIndex={0}
                        aria-label={`Text from ${when}`}
                        className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-2 font-mono text-xs"
                      >
                        {text || "Nothing written."}
                      </pre>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
