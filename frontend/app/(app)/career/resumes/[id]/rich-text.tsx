"use client";

import { Color, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { createContext, useContext, useEffect, useState, useTransition } from "react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  UnderlineIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { parseRich } from "@/lib/resume/html";
import { acceptResumeImprovement, improveResumeText, rejectResumeImprovement, type Loaded } from "./actions";

// Only the marks the backend keeps (ADR 0011): bold, italic, underline, lists, links, colour and alignment. Anything
// else Tiptap could make is switched off here, and the backend strips it anyway.
const EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    // Undo and Redo are the editor's own, so one history covers every field.
    undoRedo: false,
    link: { openOnClick: false, autolink: false, protocols: ["http", "https", "mailto"] },
  }),
  TextStyle,
  Color,
  TextAlign.configure({ types: ["paragraph"] }),
];
const LETTER_EXTENSIONS = [EXTENSIONS[0].configure({ undoRedo: {} }), ...EXTENSIONS.slice(1)];

// True while the Resume is locked: every rich text field stops accepting changes.
const LockedContext = createContext(false);
type ImproveSettings = { id: string; version: number; ready: boolean; applied: (value: Loaded) => void };
const ImproveContext = createContext<ImproveSettings | null>(null);
export const ImproveProvider = ImproveContext.Provider;
export const Locked = ({ value, children }: { value: boolean; children: React.ReactNode }) => (
  <LockedContext.Provider value={value}>{children}</LockedContext.Provider>
);
export const useLocked = () => useContext(LockedContext);

const tool =
  "inline-flex size-8 items-center justify-center rounded-md border border-transparent hover:bg-surface aria-pressed:border-border aria-pressed:bg-surface";

function ImproveText({ field, html }: { field: string; html: string }) {
  const settings = useContext(ImproveContext);
  const [value, setValue] = useState<{ id: string; original: string; suggestion: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!settings) return null;
  const plain = (html: string) => parseRich(html).map((block) => block.kind === "paragraph" ? block.runs.map((r) => r.text).join("") : block.items.map((item) => item.map((r) => r.text).join("")).join("\n")).join("\n");
  return <div className="grid gap-2 border-t border-border p-2 text-sm">
    <p className="text-muted-foreground">Sends: this field&apos;s text to Claude, made by Anthropic, using your daily AI budget.</p>
    <button type="button" className="w-fit underline underline-offset-2" disabled={!settings.ready || pending} onClick={() => start(async () => {
      const result = await improveResumeText(settings.id, field, settings.version);
      setValue(result.suggestion); setError(result.error ?? "");
    })}>Improve with AI</button>
    {error && <p role="alert">{error}</p>}
    {value && <div className="grid gap-2"><p>Original: {plain(value.original)}</p><p>Suggestion: {plain(value.suggestion)}</p>
      {value.original !== html && <p role="status">This suggestion is out of date; the text has changed.</p>}
      <div className="flex gap-3"><button type="button" className="underline underline-offset-2" disabled={!settings.ready || pending || value.original !== html} onClick={() => start(async () => {
        const result = await acceptResumeImprovement(settings.id, value.id, settings.version);
        if (result) { settings.applied(result); setValue(null); } else setError("The Resume changed or could not be saved. Reload and try again.");
      })}>Accept</button><button type="button" className="underline underline-offset-2" disabled={pending} onClick={() => start(async () => {
        if (await rejectResumeImprovement(settings.id, value.id)) setValue(null); else setError("Could not reject the suggestion. Try again.");
      })}>Reject</button></div>
    </div>}
  </div>;
}

// A word-processor style field for the summary and, later, each entry's description. It reports the HTML as the User
// types; `html` is only read when the field first appears, so the cursor never jumps.
export function RichText({
  label,
  html,
  onChange,
  field,
  ownHistory = false,
}: {
  label: string;
  html: string;
  onChange: (html: string) => void;
  field?: string;
  ownHistory?: boolean;
}) {
  const locked = useContext(LockedContext);
  const editor = useEditor({
    extensions: ownHistory ? LETTER_EXTENSIONS : EXTENSIONS,
    content: html,
    editable: !locked,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: "min-h-24 rounded-b-lg px-3 py-2 outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-link [&_a]:underline",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  useEffect(() => {
    editor?.setEditable(!locked);
  }, [editor, locked]);
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: !!e?.isActive("bold"),
      italic: !!e?.isActive("italic"),
      underline: !!e?.isActive("underline"),
      bullet: !!e?.isActive("bulletList"),
      ordered: !!e?.isActive("orderedList"),
      link: !!e?.isActive("link"),
      left: !!e?.isActive({ textAlign: "left" }),
      center: !!e?.isActive({ textAlign: "center" }),
      right: !!e?.isActive({ textAlign: "right" }),
      justify: !!e?.isActive({ textAlign: "justify" }),
    }),
  });
  if (!editor || !on) return <div className="min-h-32 rounded-lg border border-border bg-surface" aria-hidden />;

  const run = () => editor.chain().focus();
  const buttons = [
    { name: "Bold", Icon: BoldIcon, pressed: on.bold, click: () => run().toggleBold().run() },
    { name: "Italic", Icon: ItalicIcon, pressed: on.italic, click: () => run().toggleItalic().run() },
    { name: "Underline", Icon: UnderlineIcon, pressed: on.underline, click: () => run().toggleUnderline().run() },
    { name: "Bulleted list", Icon: ListIcon, pressed: on.bullet, click: () => run().toggleBulletList().run() },
    { name: "Numbered list", Icon: ListOrderedIcon, pressed: on.ordered, click: () => run().toggleOrderedList().run() },
    {
      name: "Link",
      Icon: LinkIcon,
      pressed: on.link,
      // shortcut: the address is asked with the browser's prompt, upgrade to an inline field with the design pass.
      click: () => {
        if (on.link) return run().unsetLink().run();
        const href = window.prompt("Link address (https://…)");
        if (href) run().setLink({ href }).run();
      },
    },
    { name: "Align left", Icon: AlignLeftIcon, pressed: on.left, click: () => run().setTextAlign("left").run() },
    { name: "Align centre", Icon: AlignCenterIcon, pressed: on.center, click: () => run().setTextAlign("center").run() },
    { name: "Align right", Icon: AlignRightIcon, pressed: on.right, click: () => run().setTextAlign("right").run() },
    { name: "Justify", Icon: AlignJustifyIcon, pressed: on.justify, click: () => run().setTextAlign("justify").run() },
  ];

  return (
    <div data-field={field} className="rounded-lg border border-border bg-surface focus-within:border-link">
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        {buttons.map(({ name, Icon, pressed, click }) => (
          <button key={name} type="button" aria-label={name} aria-pressed={pressed} onClick={click} className={cn(tool)}>
            <Icon aria-hidden className="size-4" />
          </button>
        ))}
        <input
          type="color"
          aria-label="Text colour"
          defaultValue="#000000"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="ml-1 size-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
      </div>
      <EditorContent editor={editor} />
      {field && <ImproveText field={field} html={html} />}
    </div>
  );
}
