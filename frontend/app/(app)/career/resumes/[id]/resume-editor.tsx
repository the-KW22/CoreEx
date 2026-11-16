"use client";

import { ChevronLeftIcon, LockIcon, LockOpenIcon, PlusIcon, Redo2Icon, Undo2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { clearUnsaved, recoveryAction, storeUnsaved, takeNewestUnsaved } from "../../../notes/[id]/recovery";
import { loadResume, saveCopy, saveResume, setLocked as lockResume } from "./actions";
import { Preview } from "./preview";
import { Locked, RichText } from "./rich-text";
import { Sections } from "./sections";
import { type Action, init, reduce, type ResumeDocument } from "./store";

const DEBOUNCE_MS = 1000;
const STORE_MS = 300;
const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

const CONTACT = [
  { field: "name", label: "Name", autoComplete: "name" },
  { field: "headline", label: "Headline", autoComplete: "organization-title" },
  { field: "email", label: "Email", autoComplete: "email" },
  { field: "phone", label: "Phone", autoComplete: "tel" },
  { field: "location", label: "Location", autoComplete: "address-level2" },
  { field: "website", label: "Website", autoComplete: "url" },
] as const;

// The Resume editor, Write mode: contact details and the summary, saved as you type. The text stays in the browser
// until it is saved, so a closed tab or an unreachable API loses nothing.
export function ResumeEditor({
  id,
  initial,
}: {
  id: string;
  initial: { title: string; document: ResumeDocument; version: number; locked: boolean };
}) {
  const [state, dispatch] = useReducer(reduce, undefined, () => init(initial.title, initial.document, initial.version));
  // Bumped when the stored Resume replaces the text, so the rich text field starts again from it.
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(initial.locked);
  const [session] = useState(() => Math.random().toString(36).slice(2));
  const latest = useRef(state);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const storeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  latest.current = state;

  // True when the Resume is saved as it stands (or already was); false when a save is running or did not go through.
  async function flush(): Promise<boolean> {
    if (saving.current) return false;
    const { title, doc, version, saved } = latest.current;
    if (title === saved.title && JSON.stringify(doc) === JSON.stringify(saved.doc)) return true;
    saving.current = true;
    dispatch({ type: "saving" });
    const result = await saveResume(id, title, doc, version).catch(() => null);
    saving.current = false;
    if (result?.status === "saved") {
      dispatch({ type: "savedAs", sent: { title, doc }, version: result.version });
      clearUnsaved(id, session);
      // Text typed while saving goes out next.
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
      return true;
    }
    if (result?.status === "conflict") {
      await keepMineAndReload();
    } else if (result?.status === "locked") {
      setLocked(true);
      setNotice("This Resume was locked in another tab. Unlock it to keep editing; your text stays here until then.");
      dispatch({ type: "failed" });
    } else {
      dispatch({ type: "failed" });
    }
    return false;
  }

  // Locking waits for the text to be saved, because a locked Resume refuses saves.
  async function toggleLock() {
    setNotice("");
    if (!locked && !(await flush())) {
      setNotice("Save the Resume first, then lock it.");
      return;
    }
    if (await lockResume(id, !locked)) setLocked(!locked);
    else setNotice("Could not change the lock. Try again.");
  }

  // One history for the whole Resume. The rich text fields start again from the restored text.
  function undo() {
    dispatch({ type: "undo" });
    setGeneration((g) => g + 1);
  }

  function redo() {
    dispatch({ type: "redo" });
    setGeneration((g) => g + 1);
  }

  // Edits go through here so a delete can offer to be undone.
  function act(action: Action) {
    dispatch(action);
    if (
      action.type === "removeSection" ||
      action.type === "removeEntry" ||
      action.type === "removeRole" ||
      action.type === "removeField"
    ) {
      toast("Removed.", { action: { label: "Undo", onClick: undo } });
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (locked || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      redo();
    }
  }

  // Another tab saved first: this tab's text becomes "<title> (mine)" and the stored Resume is loaded.
  async function keepMineAndReload() {
    const mine = latest.current;
    const kept = await saveCopy(mine.title, mine.doc);
    const theirs = await loadResume(id);
    if (!kept || !theirs) {
      dispatch({ type: "failed" });
      return;
    }
    setLocked(theirs.locked);
    dispatch({ type: "load", title: theirs.title, doc: theirs.doc, version: theirs.version });
    setGeneration((g) => g + 1);
    clearUnsaved(id, session);
    setNotice("This Resume was changed in another tab. Your text is kept as a new Resume ending in (mine), and the latest version is loaded.");
  }

  // Every change: save soon, and keep the text in the browser meanwhile.
  useEffect(() => {
    if (state.status !== "unsaved") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    storeTimer.current ??= setTimeout(() => {
      storeTimer.current = undefined;
      const now = latest.current;
      storeUnsaved(id, session, {
        title: now.title,
        body: JSON.stringify(now.doc),
        version: now.version,
        storedAt: Date.now(),
      });
    }, STORE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flush reads the latest text from a ref
  }, [state.title, state.doc, state.status === "unsaved"]);

  // Unsaved text from a closed or crashed tab: put it back when it was typed on this version, otherwise keep it as
  // a "(mine)" copy.
  // The browser's storage can only be read after hydration, so this has to set state from an effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const entry = takeNewestUnsaved(id, Date.now());
    if (!entry) return;
    const stored = { title: initial.title, body: JSON.stringify(initial.document), version: initial.version };
    const action = recoveryAction(entry, stored);
    if (action === "none") return;
    const doc = JSON.parse(entry.body) as ResumeDocument;
    if (action === "restore") {
      dispatch({ type: "restore", title: entry.title, doc });
      setNotice("Unsaved text from your last visit was put back.");
    } else {
      void saveCopy(entry.title, doc).then((kept) =>
        setNotice(kept ? "Unsaved text from an older version was kept as a new Resume ending in (mine)." : ""),
      );
    }
    setGeneration((g) => g + 1);
  }, [id, initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { doc } = state;
  const unsavedLabel = state.status === "error" ? "Not saved" : state.status === "saving" ? "Saving…" : state.status === "unsaved" ? "Unsaved changes" : "Saved";

  return (
    <div className="mx-auto grid max-w-7xl gap-6" onKeyDown={onKeyDown}>
      <header className="grid gap-3">
        <Link href="/career/library" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon aria-hidden className="size-4" />
          Resumes &amp; Letters
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Resume name</span>
            <input
              value={state.title}
              disabled={locked}
              maxLength={200}
              onChange={(e) => dispatch({ type: "title", value: e.target.value })}
              className="h-11 w-full rounded-lg border border-transparent bg-transparent px-2 text-2xl font-semibold tracking-tight hover:border-border focus:border-link"
            />
          </label>
          <p role="status" className="text-sm text-muted-foreground">
            {unsavedLabel}
          </p>
          {state.status === "error" && (
            <Button type="button" variant="outline" size="sm" onClick={() => void flush()}>
              Retry
            </Button>
          )}
          <Button type="button" variant="outline" size="icon" aria-label="Undo" disabled={locked || state.past.length === 0} onClick={undo}>
            <Undo2Icon aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="Redo" disabled={locked || state.future.length === 0} onClick={redo}>
            <Redo2Icon aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void toggleLock()}>
            {locked ? <LockOpenIcon aria-hidden /> : <LockIcon aria-hidden />}
            {locked ? "Unlock" : "Lock"}
          </Button>
        </div>
        {locked && (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            This Resume is locked. Unlock it to change it.
          </p>
        )}
        <nav aria-label="Mode" className="flex gap-2 text-sm">
          <span aria-current="page" className="rounded-lg border border-border bg-surface px-3 py-1.5 font-medium">
            Write
          </span>
        </nav>
        {notice && (
          <p role="status" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {notice}
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <Locked value={locked}>
        <fieldset disabled={locked} className="m-0 grid min-w-0 content-start gap-6 border-0 p-0">
          <section aria-labelledby="contact" className="grid gap-3">
            <h2 id="contact" className="text-lg font-semibold">
              Contact details
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONTACT.map(({ field, label, autoComplete }) => (
                <label key={field} className="grid gap-1 text-sm font-medium">
                  {label}
                  <input
                    value={doc.basics[field]}
                    autoComplete={autoComplete}
                    maxLength={200}
                    onChange={(e) => dispatch({ type: "basic", field, value: e.target.value })}
                    className={input}
                  />
                </label>
              ))}
            </div>
            <ul className="grid gap-2" aria-label="Custom details">
              {doc.basics.customFields.map((f, i) => (
                <li key={i} className="flex items-end gap-2">
                  <label className="grid flex-1 gap-1 text-sm font-medium">
                    Label
                    <input
                      value={f.label}
                      maxLength={100}
                      onChange={(e) => dispatch({ type: "field", index: i, part: "label", value: e.target.value })}
                      className={input}
                    />
                  </label>
                  <label className="grid flex-1 gap-1 text-sm font-medium">
                    Value
                    <input
                      value={f.value}
                      maxLength={200}
                      onChange={(e) => dispatch({ type: "field", index: i, part: "value", value: e.target.value })}
                      className={input}
                    />
                  </label>
                  <Button type="button" variant="outline" size="icon" aria-label={`Remove custom detail ${i + 1}`} onClick={() => act({ type: "removeField", index: i })}>
                    <XIcon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "addField" })}>
                <PlusIcon aria-hidden />
                Add a detail
              </Button>
            </div>
          </section>

          <section aria-labelledby="summary" className="grid gap-2">
            <h2 id="summary" className="text-lg font-semibold">
              Summary
            </h2>
            <RichText key={generation} label="Summary" html={doc.summary} onChange={(html) => dispatch({ type: "summary", html })} />
          </section>

          <Sections key={generation} doc={doc} dispatch={act} />

          <section aria-labelledby="notes" className="grid gap-2">
            <h2 id="notes" className="text-lg font-semibold">
              Private notes
            </h2>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Only you see these. They are never printed or downloaded.</span>
              <textarea
                value={doc.privateNotes}
                rows={4}
                maxLength={20000}
                onChange={(e) => dispatch({ type: "privateNotes", value: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2"
              />
            </label>
          </section>
        </fieldset>
        </Locked>

        <Preview doc={state.doc} title={state.title} />
      </div>
    </div>
  );
}
