"use client";

import { autocompletion, completionStatus, startCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type StateCommand, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { FileTextIcon, ImageIcon, MinimizeIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Proposal } from "@/lib/proposals";

import { answerProposals } from "../../chat/actions";
import { ItemFrame } from "../../items/item-frame";
import {
  deleteNote,
  linkPreview,
  type LoadedNote,
  keepCopyAndLoad,
  noteIfNewer,
  resolveLinks,
  restoreVersion,
  saveNote,
  suggestLinks,
} from "../actions";
import { smallestEdit } from "./edit";
import { activeFormats, toggleInline } from "./format";
import { copyOf } from "./conflict";
import { changedNotice, externalChange } from "./external";
import { restoreBlocker } from "./history";
import { clearUnsaved, recoveryAction, storeUnsaved, takeNewestUnsaved } from "./recovery";
import { NoteHistory } from "./note-history";
import { type LinkTarget, linkCompletion, linkField, linkIds, setLinks } from "./links";
import { livePreview } from "./live-preview";
import { ProposalBar } from "./proposal-bar";
import { proposalMarks, sameText } from "./proposal-marks";
import { flashRange, proposalView, showProposal } from "./proposal-view";
import { slashCompletion } from "./slash";
import { linkAt, titleFromBody, withHeading, wordCount } from "./text";
import { EditorToolbar } from "./toolbar";

const DEBOUNCE_MS = 1000;
const LINK_LOOKUP_MS = 500;
const PREVIEW_DELAY_MS = 300;
const TITLE_MAX = 200;
const STORE_MS = 500;
// How often an open Note asks whether it was changed elsewhere (an Agent, another tab).
const POLL_MS = 10_000;
// How long a just-accepted change stays marked.
const FLASH_MS = 2000;

type Status = "saved" | "unsaved" | "saving" | "conflict" | "error";
type Text = { title: string; body: string };
// The line above the title: what just happened, with an optional link in the middle.
type Notice = { before: string; link?: { href: string; label: string }; after?: string };
type Preview = { id: string; target: LinkTarget; left: number; top: number; by: "mouse" | "caret" };

const same = (a: Text, b: Text) => a.title === b.title && a.body === b.body;

// CodeMirror's own styles are not in a CSS layer, so they beat ours in globals.css (layered). The editor's look is
// set here instead, in the reading font (docs/DESIGN.md section 4.2), with our tokens.
const noteTheme = EditorView.theme({
  "&": { color: "var(--foreground)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-atkinson), system-ui, sans-serif", fontSize: "1rem", lineHeight: "1.75" },
  ".cm-content": { padding: "0", caretColor: "var(--link)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--link)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in srgb, var(--link) 25%, transparent)" },
  ".cm-tooltip": {
    fontFamily: "var(--font-manrope), system-ui, sans-serif",
    color: "var(--foreground)",
    backgroundColor: "var(--surface-raised)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "inherit" },
  ".cm-tooltip-autocomplete ul li": { padding: "0.35rem 0.6rem" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { color: "var(--foreground)", backgroundColor: "var(--surface)" },
  ".cm-completionDetail": { color: "var(--muted-foreground)", marginLeft: "0.5rem", fontStyle: "normal" },
});

// The Note screen (docs/DESIGN.md section 6.3): the writing column inside the shared Item frame. `tags` and
// `details` come rendered from the server; this adds the save status, Info and the Link preview.
export function NoteEditor({
  id,
  initial,
  crumbs,
  tags,
  details,
  detailsCookie,
  heading,
  proposals = [],
}: {
  /** Chat Proposals still waiting for this Note: one is drawn on the text when it was made for the text as it is now. */
  proposals?: Proposal[];
  id: string;
  initial: { title: string; body: string; version: number; createdAt: string; updatedAt: string; editedBy: string | null };
  crumbs: { href: string; label: string }[];
  tags: React.ReactNode;
  details: React.ReactNode;
  /** The remembered Details choice, or null to follow the screen width. */
  detailsCookie: "open" | "closed" | null;
  /** A heading to scroll to on opening (a Chat source opens its Note at the piece the model used). */
  heading?: string;
}) {
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<Status>("saved");
  const [message, setMessage] = useState("");
  // "Load theirs" in progress, why it failed, and the copy of the User's text it made.
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState("");
  // The line above the title that says what just happened: a copy kept, text put back, or a change loaded.
  const [notice, setNotice] = useState<Notice | null>(null);
  // Who changed the Note, when the open conflict was found by the check for changes and not by a save.
  const [conflictBy, setConflictBy] = useState<string | null>(null);
  // This tab's id for the copy of the unsaved text kept in the browser.
  // Not crypto.randomUUID: that is missing on a plain-http address, and this only has to differ between tabs.
  const [session] = useState(() => Math.random().toString(36).slice(2));
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  // The Access token behind the latest change, or null when it was this User; their own save always clears it.
  const [editedBy, setEditedBy] = useState(initial.editedBy);
  const [words, setWords] = useState(() => wordCount(initial.body));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewText, setPreviewText] = useState<Record<string, string | null>>({});
  // What the caret is inside (bold, a list...), as a space-separated list, for the toolbar's pressed buttons.
  const [active, setActive] = useState("");
  // Focus mode: the writing column fills the window and the rest of the page is out of reach.
  const [focus, setFocus] = useState(false);
  // The Proposal drawn on the text now, and whether its answer is on its way. Any change to the text ends it.
  const [shown, setShown] = useState<Proposal | null>(null);
  const [answering, setAnswering] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  // Proposals answered here: the page's list is from before, so they must not be drawn again.
  const answered = useRef(new Set<string>());

  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const version = useRef(initial.version);
  const saved = useRef<Text>({ title: initial.title, body: initial.body });
  const latest = useRef<Text>({ title: initial.title, body: initial.body });
  const saving = useRef(false);
  const conflict = useRef(false);
  const external = useRef(false);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const linkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const storeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const polling = useRef(false);
  // Writes the text that is not saved yet to the browser now, when there is any.
  const rememberNow = useCallback(() => {
    clearTimeout(storeTimer.current);
    storeTimer.current = undefined;
    if (same(latest.current, saved.current)) return;
    storeUnsaved(id, session, { ...latest.current, version: version.current, storedAt: Date.now() });
  }, [id, session]);
  // The text is saved, or was handed over to a copy: nothing is waiting in the browser any more.
  const forget = useCallback(() => {
    clearTimeout(storeTimer.current);
    storeTimer.current = undefined;
    clearUnsaved(id, session);
  }, [id, session]);
  // The text the editor opened with. A later re-render of the page (after adding a Tag, say) brings a newer body
  // in `initial`, which must not rebuild the editor and drop the cursor and what was typed since.
  const initialBody = useRef(initial.body);

  // One save at a time. Text typed while a save is in flight is picked up by the next loop turn.
  // shortcut: back-to-back saves while someone types without pause, add a minimum gap if API load matters.
  const flush = useCallback(
    async (overwrite = false) => {
      if (saving.current || (conflict.current && !overwrite)) return;
      saving.current = true;
      // Overwriting settles the conflict even when the text turns out to match what was last saved.
      if (overwrite) {
        conflict.current = false;
        setConflictBy(null);
      }
      try {
        for (;;) {
          const snapshot = { ...latest.current };
          // Counted here, at most once a second, rather than on every key press.
          setWords(wordCount(snapshot.body));
          if (same(snapshot, saved.current)) {
            setStatus("saved");
            forget();
            return;
          }
          setStatus("saving");
          const result = await saveNote(id, snapshot.title, snapshot.body, version.current, overwrite);
          overwrite = false;
          if (result.status === "saved") {
            // Saving does not refresh the page, so the Connections are reloaded when the Links changed.
            if (linkIds(saved.current.body).sort().join() !== linkIds(result.body).sort().join()) router.refresh();
            conflict.current = false;
            version.current = result.version;
            saved.current = snapshot;
            setSavedAt(result.updatedAt);
            setEditedBy(null);
            // The server may have turned a hand-typed [[Exact Title]] into a Link. Show that, unless more was typed.
            const editor = view.current;
            if (editor && result.body !== snapshot.body && latest.current.body === snapshot.body) {
              external.current = true;
              editor.dispatch({ changes: smallestEdit(snapshot.body, result.body) });
              external.current = false;
              latest.current.body = result.body;
              saved.current = { title: snapshot.title, body: result.body };
            }
          } else if (result.status === "conflict") {
            conflict.current = true;
            setStatus("conflict");
            return;
          } else {
            setMessage(result.message);
            setStatus("error");
            return;
          }
        }
      } catch {
        // The action itself failed (API asleep or down, network drop): say so, and let "Try again" retry.
        setMessage("Cannot reach the CoreEx API. Your changes are not saved yet.");
        setStatus("error");
      } finally {
        saving.current = false;
      }
    },
    [id, router, forget],
  );

  const changed = useCallback(() => {
    // Kept in the browser until saved, even during a conflict, when nothing is sent.
    // At most one write per STORE_MS: the whole text is written, which a big Note must not do on every key press.
    storeTimer.current ??= setTimeout(rememberNow, STORE_MS);
    if (conflict.current) return;
    setStatus("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush, rememberNow]);

  // Looks up the Links in the text that are not known yet, and tells the editor what they point at.
  const lookUpLinks = useCallback(async () => {
    const editor = view.current;
    if (!editor) return;
    const known = editor.state.field(linkField);
    const missing = linkIds(editor.state.doc.toString()).filter((linkId) => !(linkId in known));
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      const found = await resolveLinks(batch);
      // A failed lookup says nothing: leave those Links alone rather than call them unresolved.
      if (!found || view.current !== editor) return;
      const byId = new Map(found.map((target) => [target.id, target]));
      editor.dispatch({
        effects: setLinks.of(Object.fromEntries(batch.map((linkId) => [linkId, byId.get(linkId) ?? null]))),
      });
    }
  }, []);

  // Shows the preview for the Link at `pos`, placed under its start; nothing when it is not a resolved Link.
  const showPreview = useCallback((editor: EditorView, pos: number, by: Preview["by"]) => {
    // Only the caret's line: copying a big Note on every caret move would make typing stutter.
    const line = editor.state.doc.lineAt(pos);
    const onLine = linkAt(line.text, pos - line.from);
    const link = onLine && { ...onLine, from: onLine.from + line.from };
    const target = link ? editor.state.field(linkField)[link.id] : null;
    const at = link && target ? editor.coordsAtPos(link.from) : null;
    if (!link || !target || !at) {
      setPreview((p) => (p?.by === by ? null : p));
      return;
    }
    setPreview({ id: link.id, target, by, left: Math.min(at.left, window.innerWidth - 336), top: at.bottom + 6 });
  }, []);

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialBody.current,
        extensions: [
          history(),
          // Ahead of the default keys, which use Ctrl+I to select the parent syntax node.
          keymap.of([
            { key: "Mod-b", run: toggleInline("bold") },
            { key: "Mod-i", run: toggleInline("italic") },
            { key: "Mod-Shift-f", run: () => (setFocus((on) => !on), true) },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown({ base: markdownLanguage }),
          linkField,
          livePreview,
          proposalView,
          autocompletion({ override: [linkCompletion(suggestLinks), slashCompletion] }),
          EditorView.lineWrapping,
          noteTheme,
          EditorView.contentAttributes.of({ "aria-label": "Note content" }),
          EditorView.domEventHandlers({
            keydown: (event, editor) => {
              if (event.key === "Escape") {
                setPreview(null);
                // Escape closes an open menu first; with none open it leaves Focus mode.
                if (!completionStatus(editor.state)) setFocus(false);
              }
              return false;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              // The preview drops itself in the editor (proposal-view.ts); the bar goes with it.
              setShown(null);
              clearTimeout(linkTimer.current);
              linkTimer.current = setTimeout(() => void lookUpLinks(), LINK_LOOKUP_MS);
            }
            // The caret inside a Link previews it, so the keyboard and touch screens get it too.
            if (update.selectionSet || update.focusChanged || update.docChanged) {
              const { main } = update.state.selection;
              if (update.view.hasFocus && main.empty) showPreview(update.view, main.head, "caret");
              else setPreview((p) => (p?.by === "caret" ? null : p));
            }
            if (update.selectionSet || update.docChanged) setActive([...activeFormats(update.state)].sort().join(" "));
            if (!update.docChanged || external.current) return;
            latest.current.body = update.state.doc.toString();
            // The first line as "# Heading" is the Note's title: typing in it changes the title too. Only when that
            // line was touched, so an older Note whose title differs keeps it until its heading is edited.
            if (update.changes.touchesRange(0, update.startState.doc.line(1).to)) {
              const heading = titleFromBody(latest.current.body)?.slice(0, TITLE_MAX);
              if (heading !== undefined && heading !== latest.current.title) {
                latest.current.title = heading;
                setTitle(heading);
              }
            }
            changed();
          }),
        ],
      }),
    });
    view.current = editor;
    void lookUpLinks();
    return () => {
      clearTimeout(linkTimer.current);
      clearTimeout(previewTimer.current);
      editor.destroy();
      view.current = null;
    };
  }, [changed, lookUpLinks, showPreview]);

  // Opened from a Chat source: puts the heading the model used at the top. Only the first time, so typing is never moved.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    const editor = view.current;
    if (!heading || !editor || scrolledTo.current === heading) return;
    scrolledTo.current = heading;
    const plain = (text: string) => text.replace(/[*_`~]/g, "").trim().toLowerCase();
    for (let n = 1; n <= editor.state.doc.lines; n++) {
      const line = editor.state.doc.line(n);
      const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line.text);
      if (match && plain(match[1]) === plain(heading)) {
        editor.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 16 }) });
        return;
      }
    }
  }, [heading]);

  // Opening the Note: text typed before and never saved (a closed tab, a crash, an unreachable API) comes back.
  // On the stored version it is saved again; on an older one the Note starts in conflict, so the User chooses.
  useEffect(() => {
    const entry = takeNewestUnsaved(id, Date.now());
    const editor = view.current;
    if (!entry || !editor) return;
    const action = recoveryAction(entry, { ...saved.current, version: version.current });
    if (action === "none") return;
    latest.current = { title: entry.title, body: entry.body };
    setTitle(entry.title);
    external.current = true;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: entry.body } });
    external.current = false;
    setWords(wordCount(entry.body));
    setNotice({ before: "Restored changes that were not saved yet." });
    // The entry was taken out of the browser, so it goes back under this tab at once.
    rememberNow();
    if (action === "conflict") {
      conflict.current = true;
      setStatus("conflict");
    } else {
      changed();
    }
  }, [id, changed, rememberNow]);

  // Closing or leaving the tab writes what the last half second would have missed.
  useEffect(() => {
    window.addEventListener("pagehide", rememberNow);
    return () => window.removeEventListener("pagehide", rememberNow);
  }, [rememberNow]);

  // Leaving the page sends what is still waiting to be saved.
  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (status === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // In Focus mode everything outside the writing layer is inert: not clickable, not tabbable, not read out.
  useEffect(() => {
    const top = layer.current;
    if (!focus || !top) return;
    const marked: Element[] = [];
    for (let node: Element = top; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.hasAttribute("inert")) continue;
        sibling.setAttribute("inert", "");
        marked.push(sibling);
      }
    }
    return () => marked.forEach((el) => el.removeAttribute("inert"));
  }, [focus]);

  // The preview's first lines, loaded once per Link target.
  const previewId = preview?.id;
  const previewType = preview?.target.type;
  useEffect(() => {
    if (!previewId || !previewType || previewId in previewText) return;
    let current = true;
    void linkPreview(previewId, previewType).then((text) => {
      if (current) setPreviewText((all) => ({ ...all, [previewId]: text }));
    });
    return () => {
      current = false;
    };
  }, [previewId, previewType, previewText]);

  // The preview is placed for where the page is now; scrolling moves the Link away, so the preview goes.
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    window.addEventListener("scroll", hide, { capture: true, once: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [preview]);

  // "Load theirs": the text typed here is first kept as a "(mine)" Note beside this one. If that fails, nothing is
  // loaded and the conflict stays, so nothing typed is lost.
  async function loadTheirs() {
    setCopyBusy(true);
    setCopyError("");
    const mine = { ...latest.current };
    const result = await keepCopyAndLoad(id, copyOf(mine)).catch(() => null);
    setCopyBusy(false);
    if (result?.status !== "loaded") {
      setCopyError(result?.message ?? "Cannot reach the CoreEx API, so nothing was changed.");
      return;
    }
    setNotice({
      before: "Your text is kept in ",
      link: { href: `/notes/${result.copy.id}`, label: result.copy.title },
      after: result.tagsCopied ? "." : ". Its Tags could not be copied.",
    });
    // More was typed while the copy was made. Loading now would overwrite it, so the conflict stays open.
    if (!same(latest.current, mine)) {
      setCopyError("You kept typing, so the other version was not loaded. Choose again to keep the rest.");
      return;
    }
    show(result.note);
  }

  // Puts a stored Note in the editor in place of what it holds, and treats it as saved.
  const show = useCallback(
    (theirs: LoadedNote) => {
    // What was typed is no longer waiting: it was kept in a copy, or replaced on purpose.
    forget();
    version.current = theirs.version;
    saved.current = { title: theirs.title, body: theirs.body };
    latest.current = { title: theirs.title, body: theirs.body };
    conflict.current = false;
    setConflictBy(null);
    setTitle(theirs.title);
    setSavedAt(theirs.updatedAt);
    setEditedBy(theirs.editedBy);
    external.current = true;
    const editor = view.current!;
    // Only what differs, so the caret and scroll stay put, and not in Undo: undoing a change from elsewhere would
    // save the old text over it.
    editor.dispatch({
      changes: smallestEdit(editor.state.doc.toString(), theirs.body),
      annotations: Transaction.addToHistory.of(false),
    });
    external.current = false;
    setWords(wordCount(theirs.body));
    setStatus("saved");
    },
    [forget],
  );

  // Draws a waiting Proposal on the text when it was made for exactly this text and nothing here is unsaved. Not while
  // one is shown or being answered. The first fit wins; a Proposal for older text stays in the Chat, where it is stale.
  useEffect(() => {
    const editor = view.current;
    if (!editor || shown || answering || !same(latest.current, saved.current)) return;
    const fit = proposals.find((p) => !answered.current.has(p.id) && p.after != null && sameText(p.before ?? "", editor.state.doc.toString()));
    if (!fit) return;
    editor.dispatch({ effects: showProposal.of(proposalMarks(fit.before ?? "", fit.after!)) });
    setProposalError(null);
    setShown(fit);
  }, [proposals, shown, answering]);

  // The User's answer on the page: the same call as the card in the Chat. Accepting loads the stored Note at once (not
  // in Undo) and marks what changed for a moment.
  async function answerShown(decision: "APPROVE" | "REJECT") {
    const proposal = shown;
    const editor = view.current;
    if (!proposal || !editor) return;
    setAnswering(true);
    setProposalError(null);
    const result = await answerProposals(proposal.chatId, [proposal.id], decision, {}).catch(() => null);
    setAnswering(false);
    if (!result || "error" in result) {
      setProposalError(result?.error ?? "Cannot reach the CoreEx API. Nothing was changed.");
      return;
    }
    answered.current.add(proposal.id);
    editor.dispatch({ effects: showProposal.of(null) });
    setShown(null);
    // The bar (and the button just used) is gone: keep the keyboard in the Note.
    editor.focus();
    if (decision === "REJECT") {
      setNotice({ before: "Proposal rejected. Nothing was changed." });
      return;
    }
    const theirs = await noteIfNewer(id, version.current).catch(() => null);
    if (!theirs) return;
    const edit = smallestEdit(editor.state.doc.toString(), theirs.body);
    show(theirs);
    setNotice({ before: "Proposal accepted. The Note now has the proposed text." });
    editor.dispatch({ effects: flashRange.of({ from: edit.from, to: edit.from + edit.insert.length }) });
    setTimeout(() => view.current?.dispatch({ effects: flashRange.of(null) }), FLASH_MS);
  }

  // Asks every POLL_MS while the tab is visible, and again when it becomes visible, whether the Note was changed
  // elsewhere (an Agent, another tab). With nothing unsaved the new text is loaded; with unsaved text the conflict
  // opens now instead of at the next save.
  useEffect(() => {
    const check = async () => {
      if (document.hidden || saving.current || conflict.current || polling.current) return;
      polling.current = true;
      try {
        const asked = version.current;
        const theirs = await noteIfNewer(id, asked).catch(() => null);
        // Saved, or changed by something else, while the answer was on its way: it is about an older state.
        if (!theirs || version.current !== asked || saving.current || conflict.current) return;
        const change = externalChange(theirs.version, {
          version: version.current,
          unsaved: !same(latest.current, saved.current),
        });
        if (change === "load") {
          show(theirs);
          setNotice({ before: changedNotice(theirs.editedBy) });
        } else if (change === "conflict") {
          conflict.current = true;
          setConflictBy(theirs.editedBy);
          setStatus("conflict");
        }
      } finally {
        polling.current = false;
      }
    };
    const timer = setInterval(() => void check(), POLL_MS);
    const whenVisible = () => void check();
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [id, show]);

  // Brings an earlier text back. What is typed goes to the server first, so the copy the restore keeps includes it.
  // Returns why nothing was restored, or null.
  async function restore(versionId: string) {
    clearTimeout(timer.current);
    await flush();
    const blocker = restoreBlocker({
      conflict: conflict.current,
      saving: saving.current,
      unsaved: !same(latest.current, saved.current),
    });
    if (blocker) return blocker;
    const result = await restoreVersion(id, versionId, version.current);
    if (result.status === "restored") {
      show(result.note);
      router.refresh();
      return null;
    }
    if (result.status === "conflict") {
      conflict.current = true;
      setStatus("conflict");
      return "This Note was changed somewhere else, so nothing was restored.";
    }
    return result.message;
  }

  // A toolbar button: runs its command on the editor, keeps the editor focused, and opens the Link suggestions for [[ ]].
  const run = useCallback((command: StateCommand, id?: string) => {
    const editor = view.current;
    if (!editor) return;
    command({ state: editor.state, dispatch: (tr) => editor.dispatch(tr) });
    editor.focus();
    if (id === "wikilink") startCompletion(editor);
  }, []);

  const detailsBody = (
    <>
      {details}
      <NoteHistory noteId={id} onRestore={restore} />
      <section aria-labelledby="info-heading" className="grid gap-2">
        <h2 id="info-heading" className="text-xs font-semibold text-muted-foreground">
          Info
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Created</dt>
          <dd>
            <time dateTime={initial.createdAt} suppressHydrationWarning>
              {new Date(initial.createdAt).toLocaleString()}
            </time>
          </dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd>
            <time dateTime={savedAt} suppressHydrationWarning>
              {new Date(savedAt).toLocaleString()}
            </time>
          </dd>
          {editedBy && (
            <>
              <dt className="text-muted-foreground">Edited by</dt>
              <dd className="break-words">{editedBy}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Words</dt>
          <dd className="font-mono">{words}</dd>
        </dl>
      </section>
    </>
  );
  const PreviewIcon = preview?.target.type === "ASSET" ? ImageIcon : FileTextIcon;
  const saveStatus = (
    <p role="status" className="shrink-0 text-xs text-muted-foreground">
      {status === "saving" && "Saving…"}
      {status === "unsaved" && "Unsaved changes"}
      {status === "saved" && (
        <>
          Saved at{" "}
          <time dateTime={savedAt} suppressHydrationWarning>
            {new Date(savedAt).toLocaleTimeString()}
          </time>
        </>
      )}
      {(status === "conflict" || status === "error") && "Not saved"}
    </p>
  );
  // Turning Focus mode on or off keeps the editor (and its caret) where it is, then puts the keyboard back in it.
  const setFocusMode = (on: boolean) => {
    setFocus(on);
    requestAnimationFrame(() => view.current?.focus());
  };

  return (
    <ItemFrame
      crumbs={crumbs}
      current={title || "Untitled"}
      status={saveStatus}
      trash={{ id, action: deleteNote }}
      detailsCookie={detailsCookie}
      details={detailsBody}
    >
      {/* Always here, so the editor is not rebuilt when Focus mode starts: only its look changes. */}
      <div ref={layer} className={focus ? "fixed inset-0 z-50 overflow-y-auto bg-background" : "contents"}>
        {focus && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-background/90 px-4 py-2 backdrop-blur">
            {saveStatus}
            <Button type="button" size="sm" variant="outline" onClick={() => setFocusMode(false)}>
              <MinimizeIcon aria-hidden />
              Exit Focus mode
            </Button>
          </div>
        )}
        <div className="mx-auto grid w-full max-w-[700px] content-start gap-5 px-4 py-8 md:px-0">
          {status === "conflict" && (
            <div role="alert" className="grid gap-3 rounded-[10px] border border-destructive/50 bg-destructive/10 p-4">
              <p className="flex items-start gap-2 text-sm">
                <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                This Note was changed {conflictBy ? `by ${conflictBy}` : "somewhere else"} since you opened it. Keep your version, or load the other one?
                Loading the other one keeps your text as a new Note first.
              </p>
              {copyError && <p className="text-sm">{copyError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={copyBusy} onClick={() => void flush(true)}>
                  Keep mine
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={copyBusy} onClick={() => void loadTheirs()}>
                  Load theirs
                </Button>
              </div>
            </div>
          )}
          {/* Always here (and out of the layout): a live region is only announced when it already exists. */}
          <p aria-live="polite" className="sr-only">
            {notice && `${notice.before}${notice.link?.label ?? ""}${notice.after ?? ""}`}
          </p>
          {notice && (
            <p className="flex flex-wrap items-center gap-x-2 rounded-[10px] border border-border bg-surface p-3 text-sm">
              <span>
                {notice.before}
                {notice.link && (
                  <Link href={notice.link.href} className="font-medium underline underline-offset-2">
                    {notice.link.label}
                  </Link>
                )}
                {notice.after}
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setNotice(null)}>
                Dismiss
              </Button>
            </p>
          )}
          {shown && <ProposalBar label={shown.label} chatId={shown.chatId} busy={answering} error={proposalError} onAnswer={(d) => void answerShown(d)} />}
          {status === "error" && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-[10px] border border-destructive/50 bg-destructive/10 p-4 text-sm"
            >
              <span className="flex-1">{message}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void flush()}>
                Try again
              </Button>
            </div>
          )}

          <label>
            <span className="sr-only">Title</span>
            <input
              value={title}
              maxLength={TITLE_MAX}
              placeholder="Untitled"
              onChange={(event) => {
                const value = event.target.value;
                setTitle(value);
                latest.current.title = value;
                // The title is the first line too: rewrite that line (or put a heading in front), as an outside edit
                // so the editor does not echo it back into the title.
                const editor = view.current;
                const next = withHeading(latest.current.body, value);
                if (editor && next !== latest.current.body) {
                  external.current = true;
                  editor.dispatch({ changes: smallestEdit(latest.current.body, next) });
                  external.current = false;
                  latest.current.body = next;
                }
                changed();
              }}
              className="w-full bg-transparent p-0 text-3xl font-semibold tracking-tight placeholder:text-muted-foreground focus-visible:outline-none md:text-4xl"
            />
          </label>
          <div className={focus ? "hidden" : "contents"}>{tags}</div>
          <div className={focus ? "hidden" : "contents"}>
            <EditorToolbar run={run} active={active} onFocusMode={() => setFocusMode(true)} />
          </div>
          {/* Mouse previews are heard here: CodeMirror leaves events inside a Link widget to the widget. */}
          <div
            ref={host}
            className="note-editor"
            onMouseOver={(event) => {
              const editor = view.current;
              const link = (event.target as HTMLElement).closest(".cm-wikilink, .cm-wikilink-raw");
              clearTimeout(previewTimer.current);
              if (!editor || !link) return;
              const pos = editor.posAtDOM(link);
              previewTimer.current = setTimeout(() => showPreview(editor, pos, "mouse"), PREVIEW_DELAY_MS);
            }}
            onMouseLeave={() => {
              clearTimeout(previewTimer.current);
              previewTimer.current = setTimeout(() => setPreview((p) => (p?.by === "mouse" ? null : p)), 150);
            }}
          />
        </div>

      {/* Always mounted: screen readers only announce changes to a live region that already exists. */}
      <p aria-live="polite" className="sr-only">
        {preview &&
          `Link to ${preview.target.type === "NOTE" ? "Note" : "Asset"} ${preview.target.title || "Untitled"}, in ${
            preview.target.folderPath ?? "the top level"
          }. ${previewText[preview.id] ?? ""}`}
      </p>
      {preview && (
        <div
          aria-hidden
          data-link-preview
          className="fixed z-50 grid w-80 gap-1.5 rounded-[10px] border border-border bg-popover p-3 text-sm shadow-lg"
          style={{ left: Math.max(8, preview.left), top: preview.top }}
          onMouseEnter={() => clearTimeout(previewTimer.current)}
          onMouseLeave={() => setPreview((p) => (p?.by === "mouse" ? null : p))}
        >
          <span className="flex items-center gap-2 font-semibold">
            <PreviewIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{preview.target.title || "Untitled"}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {preview.target.type === "NOTE" ? "Note" : "Asset"} · {preview.target.folderPath ?? "Top level"}
          </span>
          <span className="line-clamp-3 text-muted-foreground">
            {!(preview.id in previewText)
              ? "Loading…"
              : previewText[preview.id] === null
                ? ""
                : previewText[preview.id] || "Nothing written yet."}
          </span>
        </div>
      )}
      </div>
    </ItemFrame>
  );
}
