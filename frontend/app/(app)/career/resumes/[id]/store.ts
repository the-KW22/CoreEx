import type { components } from "@/lib/api/schema";

export type ResumeDocument = components["schemas"]["ResumeDocument"];
type Basics = components["schemas"]["Basics"];

export type Status = "saved" | "saving" | "unsaved" | "error";

export type EditorState = {
  title: string;
  doc: ResumeDocument;
  // What the server holds, as last sent or loaded, and its save counter.
  saved: { title: string; doc: ResumeDocument };
  version: number;
  status: Status;
};

export type Action =
  | { type: "title"; value: string }
  | { type: "basic"; field: Exclude<keyof Basics, "customFields">; value: string }
  | { type: "summary"; html: string }
  | { type: "addField" }
  | { type: "field"; index: number; part: "label" | "value"; value: string }
  | { type: "removeField"; index: number }
  | { type: "saving" }
  | { type: "savedAs"; sent: { title: string; doc: ResumeDocument }; version: number }
  | { type: "failed" }
  | { type: "restore"; title: string; doc: ResumeDocument }
  | { type: "load"; title: string; doc: ResumeDocument; version: number };

export const sameText = (a: { title: string; doc: ResumeDocument }, b: { title: string; doc: ResumeDocument }) =>
  a.title === b.title && JSON.stringify(a.doc) === JSON.stringify(b.doc);

export function init(title: string, doc: ResumeDocument, version: number): EditorState {
  return { title, doc, saved: { title, doc }, version, status: "saved" };
}

const edited = (s: EditorState, next: Partial<Pick<EditorState, "title" | "doc">>): EditorState => {
  const merged = { ...s, ...next };
  return { ...merged, status: sameText(merged, s.saved) ? "saved" : "unsaved" };
};

const withBasics = (s: EditorState, change: Partial<Basics>) =>
  edited(s, { doc: { ...s.doc, basics: { ...s.doc.basics, ...change } } });

// The one place the editor's text changes. Later tickets (sections, Undo, design) add actions here.
export function reduce(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case "title":
      return edited(s, { title: a.value });
    case "basic":
      return withBasics(s, { [a.field]: a.value });
    case "summary":
      return edited(s, { doc: { ...s.doc, summary: a.html } });
    case "addField":
      return withBasics(s, { customFields: [...s.doc.basics.customFields, { label: "", value: "" }] });
    case "field":
      return withBasics(s, {
        customFields: s.doc.basics.customFields.map((f, i) => (i === a.index ? { ...f, [a.part]: a.value } : f)),
      });
    case "removeField":
      return withBasics(s, { customFields: s.doc.basics.customFields.filter((_, i) => i !== a.index) });
    case "saving":
      return { ...s, status: "saving" };
    case "savedAs":
      // Typing during the save keeps the text unsaved; otherwise it is saved.
      return { ...s, saved: a.sent, version: a.version, status: sameText(s, a.sent) ? "saved" : "unsaved" };
    case "failed":
      return { ...s, status: "error" };
    case "restore":
      // Text found in the browser after a crash: on screen as unsaved, so it saves like a fresh edit.
      return edited(s, { title: a.title, doc: a.doc });
    case "load":
      return init(a.title, a.doc, a.version);
  }
}

// The title of the copy that keeps the User's text when another tab saved first, cut so the whole name fits.
export function mineTitle(title: string) {
  const suffix = " (mine)";
  let name = (title.trim() || "Untitled").slice(0, 200 - suffix.length);
  // Do not leave half of a character outside the basic plane.
  if (/[\uD800-\uDBFF]$/.test(name)) name = name.slice(0, -1);
  return `${name.trimEnd()}${suffix}`;
}
