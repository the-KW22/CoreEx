"use client";

import { autocompletion, completionStatus, startCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type StateCommand } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { FileTextIcon, ImageIcon, MinimizeIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { ItemFrame } from "../../items/item-frame";
import { deleteNote, linkPreview, loadNote, resolveLinks, saveNote, suggestLinks } from "../actions";
import { smallestEdit } from "./edit";
import { activeFormats, toggleInline } from "./format";
import { type LinkTarget, linkCompletion, linkField, linkIds, setLinks } from "./links";
import { livePreview } from "./live-preview";
import { slashCompletion } from "./slash";
import { linkAt, titleFromBody, withHeading, wordCount } from "./text";
import { EditorToolbar } from "./toolbar";

const DEBOUNCE_MS = 1000;
const LINK_LOOKUP_MS = 500;
const PREVIEW_DELAY_MS = 300;
const TITLE_MAX = 200;

type Status = "saved" | "unsaved" | "saving" | "conflict" | "error";
type Text = { title: string; body: string };
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
}: {
  id: string;
  initial: { title: string; body: string; version: number; createdAt: string; updatedAt: string; editedBy: string | null };
  crumbs: { href: string; label: string }[];
  tags: React.ReactNode;
  details: React.ReactNode;
  /** The remembered Details choice, or null to follow the screen width. */
  detailsCookie: "open" | "closed" | null;
}) {
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<Status>("saved");
  const [message, setMessage] = useState("");
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

  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const version = useRef(initial.version);
  const saved = useRef<Text>({ title: initial.title, body: initial.body });
  const latest = useRef<Text>({ title: initial.title, body: initial.body });
  const saving = useRef(false);
  const conflict = useRef(false);
  const external = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const linkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
      if (overwrite) conflict.current = false;
      try {
        for (;;) {
          const snapshot = { ...latest.current };
          // Counted here, at most once a second, rather than on every key press.
          setWords(wordCount(snapshot.body));
          if (same(snapshot, saved.current)) {
            setStatus("saved");
            return;
          }
          setStatus("saving");
          const result = await saveNote(id, snapshot.title, snapshot.body, version.current, overwrite);
          overwrite = false;
          if (result.status === "saved") {
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
    [id],
  );

  const changed = useCallback(() => {
    if (conflict.current) return;
    setStatus("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

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

  async function reload() {
    const theirs = await loadNote(id);
    if (!theirs) {
      setMessage("Could not load the latest version.");
      setStatus("error");
      return;
    }
    version.current = theirs.version;
    saved.current = { title: theirs.title, body: theirs.body };
    latest.current = { title: theirs.title, body: theirs.body };
    conflict.current = false;
    setTitle(theirs.title);
    setSavedAt(theirs.updatedAt);
    setEditedBy(theirs.editedBy);
    external.current = true;
    const editor = view.current!;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: theirs.body } });
    external.current = false;
    setWords(wordCount(theirs.body));
    setStatus("saved");
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
                This Note was changed somewhere else since you opened it. Keep your version, or load the other one?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void flush(true)}>
                  Keep mine
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
                  Load theirs
                </Button>
              </div>
            </div>
          )}
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
