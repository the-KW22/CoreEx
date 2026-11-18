"use client";

import { ChevronDownIcon, ChevronLeftIcon, LockIcon, LockOpenIcon, PlusIcon, Redo2Icon, Undo2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { parseCss, partOf } from "@/lib/resume/custom-css";
import { fitToPage, intendedPages, LIMITS } from "@/lib/resume/fit";
import { createMeasurer } from "@/lib/resume/measure";
import type { Template } from "@/lib/resume/blocks";
import { cn } from "@/lib/utils";
import { checkResume } from "@/lib/resume/check";

import { clearUnsaved, recoveryAction, storeUnsaved, takeNewestUnsaved } from "../../../notes/[id]/recovery";
import {
  loadResume,
  nameCurrentVersion,
  openVersion,
  photoData,
  restoreVersion,
  resumeMarkdown,
  saveCopy,
  saveResume,
  setLocked as lockResume,
  type Review,
} from "./actions";
import { AiReview, matchingReview } from "./ai-review";
import { cardDomId, EditorCard, OpenContext, type OpenState } from "./cards";
import { Preview } from "./preview";
import { Controls } from "./controls";
import { Design } from "./design";
import { Check } from "./check";
import { JobMatch } from "./job-match";
import { History } from "./history";
import { PhotoSection } from "./photo";
import { ImproveProvider, Locked, RichText } from "./rich-text";
import { Sections } from "./sections";
import { DEFAULT_TITLES, type Action, init, reduce, type ResumeDocument } from "./store";

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

const MODES = ["write", "design", "check", "history"] as const;

// The Resume editor, Write mode: contact details and the summary, saved as you type. The text stays in the browser
// until it is saved, so a closed tab or an unreachable API loses nothing.
export function ResumeEditor({
  id,
  initial,
  organise,
  backlinks,
}: {
  id: string;
  initial: { title: string; document: ResumeDocument; version: number; locked: boolean };
  // The Folder picker and Tag editor, made on the server. They organise the Resume rather than edit it, so they work on a locked one.
  organise: React.ReactNode;
  backlinks: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reduce, undefined, () => init(initial.title, initial.document, initial.version));
  // Bumped when the stored Resume replaces the text, so the rich text field starts again from it.
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState("");
  // Why Fit to page could not fit the Resume. It is shown in the overflow banner beside the page, not up here.
  const [fitNote, setFitNote] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [locked, setLocked] = useState(initial.locked);
  const [mode, setMode] = useState<"write" | "design" | "check" | "history">("write");
  // An earlier version looked at in the page preview (the Resume itself is not changed), and a counter that tells History
  // to read its list again.
  const [viewing, setViewing] = useState<{ id: string; doc: ResumeDocument } | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [fitting, setFitting] = useState(false);
  // The Folder, Tags and Backlinks, folded away until asked for.
  const [details, setDetails] = useState(false);
  // Cards and entries the User opened or closed. Anything not in here keeps its default.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  // The photo picture for an Asset id, once it has been fetched (null: it cannot be shown).
  const [loadedPhoto, setLoadedPhoto] = useState<{ id: string; src: string | null } | null>(null);
  // Custom style text that has problems stays here, not in the document, until it is fixed. Null: the document's own.
  const [draft, setDraft] = useState<string | null>(null);
  // The next click on the page picks a part for a custom rule instead of jumping to its field.
  const [picking, setPicking] = useState(false);
  // A template being looked at in the page preview, not yet applied.
  const [candidate, setCandidate] = useState<Template | null>(null);
  const [session] = useState(() => Math.random().toString(36).slice(2));
  const latest = useRef(state);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const storeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The newest text for the timers and handlers below, which run after a render.
  useEffect(() => {
    latest.current = state;
  });

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

  // Puts the cursor in the field the reference names, once the form is on screen.
  function focusField(ref: string) {
    const field = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(ref)}"]`);
    if (!field) return;
    field.scrollIntoView({ block: "center" });
    (field.querySelector<HTMLElement>("[contenteditable=true]") ?? field).focus();
  }

  // The open state of the cards and entries, shared with the form below.
  const openState = useMemo<OpenState>(
    () => ({
      isOpen: (key, fallback) => (key in overrides ? overrides[key] : fallback),
      setOpen: (key, open) => setOverrides((prev) => ({ ...prev, [key]: open })),
      reveal: (keys) => setOverrides((prev) => ({ ...prev, ...Object.fromEntries(keys.map((key) => [key, true])) })),
    }),
    [overrides],
  );

  // The picture of the photo, fetched whenever another Asset is chosen. It is shown only for the Asset it was fetched for.
  const photoId = state.doc.basics.photo.assetId;
  useEffect(() => {
    if (!photoId) return;
    let current = true;
    void photoData(photoId).then((src) => current && setLoadedPhoto({ id: photoId, src }));
    return () => {
      current = false;
    };
  }, [photoId]);
  const photoSrc = photoId && loadedPhoto?.id === photoId ? loadedPhoto.src : null;

  // Looks at an earlier version in the page preview; null stops looking.
  async function view(versionId: string | null) {
    if (!versionId) return setViewing(null);
    const opened = await openVersion(id, versionId);
    setViewing(opened ? { id: versionId, doc: opened.doc } : null);
  }

  // Keeps the Resume as it is saved now under a name: unsaved text is saved first, so the name is of what is on screen.
  async function nameCurrent(name: string) {
    if (!(await flush())) return false;
    return nameCurrentVersion(id, name);
  }

  // Brings an earlier version back as the Resume. Unsaved text is saved first, so it is part of what is kept.
  async function restore(versionId: string) {
    setRestoring(true);
    setNotice("");
    try {
      if (!(await flush())) return setNotice("Save the Resume first, then restore a version.");
      const stored = await loadResume(id);
      if (!stored) return setNotice("Could not read the Resume. Try again.");
      const result = await restoreVersion(id, versionId, stored.version);
      if (result.status === "restored") {
        dispatch({ type: "load", title: result.resume.title, doc: result.resume.doc, version: result.resume.version });
        setLocked(result.resume.locked);
        setGeneration((g) => g + 1);
        setViewing(null);
        setMode("write");
        setHistoryRefresh((n) => n + 1);
        setNotice("The version is back. The one it replaced is kept in History.");
      } else if (result.status === "locked") setNotice("This Resume is locked. Unlock it to restore a version.");
      else if (result.status === "conflict") setNotice("This Resume was changed somewhere else. Look at the history again and retry.");
      else setNotice("Could not restore that version. Try again.");
    } finally {
      setRestoring(false);
    }
  }

  // Squeezes the Resume back onto the pages it means to have, within limits, or says it cannot and changes nothing.
  async function fit() {
    setFitting(true);
    setNotice("");
    setFitNote("");
    const measurer = createMeasurer(photoSrc);
    try {
      const pages = intendedPages(doc);
      const result = await fitToPage(doc, measurer.pagesFor);
      if (!result) {
        setFitNote(
          `This Resume does not fit on ${pages === 1 ? "one page" : `${pages} pages`} even with compact density, ${LIMITS.margin} pt margins and ${LIMITS.fontSize} pt text, so nothing was changed. Add a page, or shorten the text.`,
        );
      } else if (Object.keys(result.patch).length > 0) {
        dispatch({ type: "design", patch: result.patch });
        const { density, margin, fontSize } = result.patch;
        setNotice(
          `Fitted to ${pages === 1 ? "one page" : `${pages} pages`}: ${[density && "compact density", margin !== undefined && `${margin} pt margins`, fontSize !== undefined && `${fontSize} pt text`].filter(Boolean).join(", ")}.`,
        );
      }
    } catch {
      setNotice("Could not fit the page. Try again.");
    } finally {
      measurer.close();
      setFitting(false);
    }
  }

  // The custom rules: text with problems is kept apart (and shown with them); fine text goes into the document.
  const css = draft ?? state.doc.metadata.customCss;
  function changeCss(text: string) {
    if (parseCss(text).problems.length > 0) {
      setDraft(text);
      return;
    }
    setDraft(null);
    dispatch({ type: "design", patch: { customCss: text } });
  }

  // A click on the page while picking: a rule for that kind of part (kept if there is one already), cursor in the rules.
  function pick(ref: string) {
    const part = partOf(ref);
    setPicking(false);
    if (!part) return;
    const has = new RegExp(`(^|[},\\s])${part}\\s*[,{]`).test(css);
    if (!has) changeCss(`${css.trimEnd()}${css.trim() ? "\n" : ""}${part} {\n  \n}\n`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-field="custom-css"]')?.focus());
  }

  // The cards and entries a reference sits in: they must be open before its field can be reached.
  function cardsFor(ref: string): string[] {
    if (ref.startsWith("basics.")) return ["card:contact"];
    if (ref === "summary") return ["card:summary"];
    if (ref.startsWith("section:")) return [`card:${ref}`];
    const entryId = /^entry:([^:]+):/.exec(ref)?.[1];
    const roleId = /^role:([^:]+):/.exec(ref)?.[1];
    const hit = doc.sections.flatMap((s) => s.entries.map((entry) => ({ section: s, entry }))).find(
      ({ entry }) => entry.id === entryId || entry.roles.some((role) => role.id === roleId),
    );
    return hit ? [`card:section:${hit.section.id}`, `entry:${hit.entry.id}`] : [];
  }

  // A click on the page: jump to the field it came from. From Design mode the form comes back first.
  function select(ref: string) {
    if (picking) return pick(ref);
    if (ref === "design") { setMode("design"); return; }
    if (mode !== "write") {
      setMode("write");
      setCandidate(null);
      setViewing(null);
    }
    const keys = cardsFor(ref);
    if (keys.length > 0) openState.reveal(keys);
    // The form is drawn after the cards open, so the field is looked for on the next frame.
    requestAnimationFrame(() => focusField(ref));
  }

  // The jump list: opens a card and scrolls to it.
  function jump(key: string) {
    openState.reveal([key]);
    requestAnimationFrame(() => document.getElementById(cardDomId(key))?.scrollIntoView({ block: "start", behavior: "smooth" }));
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
  const checks = useMemo(() => checkResume(doc, new Date().getUTCFullYear()), [doc]);
  const reviewPins = useMemo(() => reviews.flatMap((review) => matchingReview(review, doc).suggestions.map((item) => ({
    id: item.id, category: "Writing", severity: "warning" as const, message: "AI writing suggestion", ref: item.field, ignored: false,
  }))), [reviews, doc]);
  // What the page preview draws: the Resume, or a template being looked at. The same object while neither changes.
  const shown = useMemo(
    () => (viewing ? viewing.doc : candidate ? { ...doc, metadata: { ...doc.metadata, template: candidate } } : doc),
    [doc, candidate, viewing],
  );
  const unsavedLabel = state.status === "error" ? "Not saved" : state.status === "saving" ? "Saving…" : state.status === "unsaved" ? "Unsaved changes" : "Saved";
  // The jump list: the editor's cards in the order they are drawn.
  const jumps = [
    { key: "card:contact", label: "Contact" },
    { key: "card:summary", label: "Summary" },
    ...doc.sections.map((s) => ({ key: `card:section:${s.id}`, label: s.title.trim() || DEFAULT_TITLES[s.kind] })),
    { key: "card:notes", label: "Private notes" },
  ];

  return (
    <OpenContext.Provider value={openState}>
    <div className="mx-auto grid max-w-7xl gap-6" onKeyDown={onKeyDown}>
      <header className="grid gap-3 border-b border-border pb-4">
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
        <Collapsible open={details} onOpenChange={setDetails} className="grid gap-3">
          <div>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <ChevronDownIcon aria-hidden className={cn("transition-transform", !details && "-rotate-90")} />
                Details
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="grid gap-3">
            <section aria-label="Folder and Tags" className="flex flex-wrap items-start gap-x-8 gap-y-3 text-sm">
              {organise}
            </section>
            {backlinks}
          </CollapsibleContent>
        </Collapsible>
        {notice && (
          <p role="status" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {notice}
          </p>
        )}
        <nav aria-label="Mode" className="-mb-px flex gap-1 text-sm">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-current={mode === m ? "page" : undefined}
              onClick={() => {
                setMode(m);
                if (m !== "design") setCandidate(null);
                if (m !== "history") setViewing(null);
              }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-muted-foreground hover:text-foreground",
                mode === m ? "border-link font-medium text-foreground" : "border-transparent",
              )}
            >
              {m === "write" ? "Write" : m === "design" ? "Design" : m === "check" ? "Check" : "History"}
            </button>
          ))}
        </nav>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-0">
        <div className="grid min-w-0 content-start gap-6 lg:border-r lg:border-border lg:pr-8">
        {mode === "write" && (
          <nav aria-label="Jump to" className="flex flex-wrap gap-2">
            {jumps.map((j) => (
              <Button key={j.key} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => jump(j.key)}>
                {j.label}
              </Button>
            ))}
          </nav>
        )}
        <ImproveProvider value={{ id, version: state.version, ready: state.status === "saved" && !locked && !viewing, applied: (value) => {
          if (latest.current.status !== "saved" || latest.current.version !== value.version - 1) {
            void keepMineAndReload();
            return;
          }
          dispatch({ type: "load", title: value.title, doc: value.doc, version: value.version });
          setGeneration((g) => g + 1); setHistoryRefresh((n) => n + 1); clearUnsaved(id, session);
        } }}><Locked value={locked}>
        <fieldset disabled={locked} className={cn("m-0 grid min-w-0 content-start gap-6 border-0 p-0", mode !== "write" && "hidden")}>
          <EditorCard cardKey="card:contact" label="Contact details" title={<h2 className="min-w-0 flex-1 text-lg font-semibold">Contact details</h2>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONTACT.map(({ field, label, autoComplete }) => (
                <label key={field} className="grid gap-1 text-sm font-medium">
                  {label}
                  <input
                    data-field={`basics.${field}`}
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
          </EditorCard>

          <EditorCard cardKey="card:photo" label="Photo" title={<h2 className="min-w-0 flex-1 text-lg font-semibold">Photo</h2>}>
            <PhotoSection photo={doc.basics.photo} photoSrc={photoSrc} dispatch={dispatch} />
          </EditorCard>

          <EditorCard cardKey="card:summary" label="Summary" title={<h2 className="min-w-0 flex-1 text-lg font-semibold">Summary</h2>}>
            <RichText key={generation} label="Summary" field="summary" html={doc.summary} onChange={(html) => dispatch({ type: "summary", html })} />
          </EditorCard>

          <Sections key={generation} doc={doc} dispatch={act} />

          <EditorCard cardKey="card:notes" label="Private notes" title={<h2 className="min-w-0 flex-1 text-lg font-semibold">Private notes</h2>}>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Only you see these. They are excluded from PDF, Word and Markdown; the JSON backup includes them.</span>
              <textarea
                value={doc.privateNotes}
                rows={4}
                maxLength={20000}
                onChange={(e) => dispatch({ type: "privateNotes", value: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2"
              />
            </label>
          </EditorCard>
        </fieldset>
        </Locked></ImproveProvider>
        {mode === "check" && <div className="grid min-w-0 content-start gap-6"><Check score={checks.score} issues={checks.issues} locked={locked} select={select}
          ignore={(id, ignored) => dispatch({ type: "ignoreCheck", id, ignored })}
          fix={(issue) => { if (issue.fix === "font") dispatch({ type: "design", patch: { fontSize: 9 } }); }} /><JobMatch doc={doc} locked={locked} ignore={(id, ignored) => dispatch({ type: "ignoreCheck", id, ignored })} />
          <AiReview id={id} version={state.version} ready={state.status === "saved" && !locked} doc={doc} reviews={reviews} setReviews={setReviews} applied={(value) => {
            if (latest.current.status !== "saved" || latest.current.version !== value.version - 1) { void keepMineAndReload(); return; }
            dispatch({ type: "load", title: value.title, doc: value.doc, version: value.version });
            setGeneration((g) => g + 1); setHistoryRefresh((n) => n + 1); clearUnsaved(id, session);
          }} /></div>}
        {mode === "history" && (
          <div className="grid min-w-0 content-start gap-6">
            <History
              id={id}
              locked={locked}
              busy={restoring}
              viewing={viewing?.id ?? null}
              refresh={historyRefresh}
              onView={(versionId) => void view(versionId)}
              onRestore={(versionId) => void restore(versionId)}
              onNameCurrent={nameCurrent}
            />
          </div>
        )}
        {mode === "design" && (
          <div className="grid min-w-0 content-start gap-6">
            <Design
              doc={doc}
              candidate={candidate}
              locked={locked}
              photoSrc={photoSrc}
              onCandidate={setCandidate}
              onApply={(template) => {
                dispatch({ type: "template", value: template });
                setCandidate(null);
              }}
            />
            <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
              <Controls
                key={generation}
                doc={doc}
                dispatch={dispatch}
                css={css}
                onCss={changeCss}
                picking={picking}
                onPicking={() => setPicking((p) => !p)}
                onReset={() => {
                  dispatch({ type: "resetDesign" });
                  setGeneration((g) => g + 1);
                }}
              />
            </fieldset>
          </div>
        )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:self-start lg:pl-8">
          <Preview fill fitNote={fitNote} checkMode={mode === "check"} pins={mode === "check" ? [...checks.issues.filter((i) => !i.ignored), ...reviewPins] : []} doc={shown} photoSrc={photoSrc} title={state.title} markdownAvailable={!viewing && !candidate && state.status === "saved"} onMarkdown={async () => {
            const version = latest.current.version;
            const result = await resumeMarkdown(id);
            return result && result.version === version && latest.current.version === version && latest.current.status === "saved" ? result.markdown : null;
          }} onSelect={select} fitting={fitting} onFit={() => void fit()} onAddPage={() => dispatch({ type: "design", patch: { pageCount: intendedPages(doc) + 1 } })} />
        </div>
      </div>
    </div>
    </OpenContext.Provider>
  );
}
