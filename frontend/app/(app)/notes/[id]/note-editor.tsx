"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadNote, saveNote } from "../actions";
import { livePreview } from "./live-preview";

const DEBOUNCE_MS = 1000;

type Status = "saved" | "unsaved" | "saving" | "conflict" | "error";
type Text = { title: string; body: string };

const same = (a: Text, b: Text) => a.title === b.title && a.body === b.body;

export function NoteEditor({
  id,
  initial,
}: {
  id: string;
  initial: { title: string; body: string; version: number; updatedAt: string };
}) {
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<Status>("saved");
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState(initial.updatedAt);

  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const version = useRef(initial.version);
  const saved = useRef<Text>({ title: initial.title, body: initial.body });
  const latest = useRef<Text>({ title: initial.title, body: initial.body });
  const saving = useRef(false);
  const conflict = useRef(false);
  const external = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.body,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          livePreview,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Note content" }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || external.current) return;
            latest.current.body = update.state.doc.toString();
            changed();
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [initial.body, changed]);

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
    external.current = true;
    const editor = view.current!;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: theirs.body } });
    external.current = false;
    setStatus("saved");
  }

  return (
    <>
      <label className="note-title">
        <span className="visually-hidden">Title</span>
        <input
          value={title}
          maxLength={200}
          placeholder="Untitled"
          onChange={(event) => {
            setTitle(event.target.value);
            latest.current.title = event.target.value;
            changed();
          }}
        />
      </label>

      <p className="save-status" role="status">
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
      </p>

      {status === "conflict" && (
        <div role="alert" className="conflict">
          <p>This Note was changed somewhere else since you opened it.</p>
          <div className="actions">
            <button type="button" onClick={() => void reload()}>
              Reload their version
            </button>
            <button type="button" onClick={() => void flush(true)}>
              Overwrite with mine
            </button>
          </div>
        </div>
      )}
      {status === "error" && (
        <p role="alert">
          {message}{" "}
          <button type="button" onClick={() => void flush()}>
            Try again
          </button>
        </p>
      )}

      <div ref={host} className="note-editor" />
    </>
  );
}
