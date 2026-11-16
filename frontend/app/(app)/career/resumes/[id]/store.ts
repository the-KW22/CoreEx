import type { components } from "@/lib/api/schema";
import { type Metadata, type Photo, resetDesign } from "../../../../../lib/resume/design";

export type ResumeDocument = components["schemas"]["ResumeDocument"];
type Basics = components["schemas"]["Basics"];
export type Section = components["schemas"]["Section"];
export type Entry = components["schemas"]["Entry"];
export type Role = components["schemas"]["Role"];
export type Kind = Section["kind"];

// The name a new section of each kind starts with.
export const DEFAULT_TITLES: Record<Kind, string> = {
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  PROJECTS: "Projects",
  SKILLS: "Skills",
  LANGUAGES: "Languages",
  CERTIFICATIONS: "Certifications",
  AWARDS: "Awards",
  PUBLICATIONS: "Publications",
  VOLUNTEERING: "Volunteering",
  INTERESTS: "Interests",
  REFERENCES: "References",
  PROFILES: "Profiles",
  CUSTOM: "Custom section",
};

export const blankEntry = (id: string): Entry => ({
  id,
  hidden: false,
  title: "",
  subtitle: "",
  location: "",
  startDate: "",
  endDate: "",
  url: "",
  level: "",
  description: "",
  keywords: [],
  roles: [],
});

export type Status = "saved" | "saving" | "unsaved" | "error";

// What Undo and Redo step between: the text of the Resume, never its save state.
export type Snapshot = { title: string; doc: ResumeDocument };

// Undo goes back this many steps.
export const HISTORY_LIMIT = 200;

export type EditorState = {
  title: string;
  doc: ResumeDocument;
  past: Snapshot[];
  future: Snapshot[];
  // The field the last edit typed in, so the next keystroke in it joins the same step; null after any other change.
  group: string | null;
  // What the server holds, as last sent or loaded, and its save counter.
  saved: { title: string; doc: ResumeDocument };
  version: number;
  status: Status;
};

export type Action =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "privateNotes"; value: string }
  | { type: "template"; value: string }
  | { type: "photo"; patch: Partial<Photo> }
  | { type: "design"; patch: Partial<Metadata> }
  | { type: "placeSection"; section: string; column?: string; page?: number }
  | { type: "resetDesign" }
  | { type: "title"; value: string }
  | { type: "basic"; field: Exclude<keyof Basics, "customFields" | "photo">; value: string }
  | { type: "summary"; html: string }
  | { type: "addField" }
  | { type: "field"; index: number; part: "label" | "value"; value: string }
  | { type: "removeField"; index: number }
  | { type: "dateFormat"; value: string }
  | { type: "addSection"; id: string; kind: Kind }
  | { type: "renameSection"; id: string; title: string }
  | { type: "toggleSection"; id: string }
  | { type: "removeSection"; id: string }
  | { type: "moveSection"; id: string; to: number }
  | { type: "addEntry"; section: string; id: string }
  | { type: "editEntry"; section: string; id: string; patch: Partial<Entry> }
  | { type: "duplicateEntry"; section: string; id: string; newId: string }
  | { type: "toggleEntry"; section: string; id: string }
  | { type: "removeEntry"; section: string; id: string }
  | { type: "moveEntry"; section: string; id: string; to: number }
  | { type: "moveEntryTo"; section: string; id: string; target: string }
  | { type: "addRole"; section: string; entry: string; id: string }
  | { type: "editRole"; section: string; entry: string; id: string; patch: Partial<Role> }
  | { type: "removeRole"; section: string; entry: string; id: string }
  | { type: "saving" }
  | { type: "savedAs"; sent: { title: string; doc: ResumeDocument }; version: number }
  | { type: "failed" }
  | { type: "restore"; title: string; doc: ResumeDocument }
  | { type: "load"; title: string; doc: ResumeDocument; version: number };

export const sameText = (a: { title: string; doc: ResumeDocument }, b: { title: string; doc: ResumeDocument }) =>
  a.title === b.title && JSON.stringify(a.doc) === JSON.stringify(b.doc);

export function init(title: string, doc: ResumeDocument, version: number): EditorState {
  return { title, doc, past: [], future: [], group: null, saved: { title, doc }, version, status: "saved" };
}

const edited = (s: EditorState, next: Partial<Pick<EditorState, "title" | "doc">>): EditorState => {
  const merged = { ...s, ...next };
  return { ...merged, status: sameText(merged, s.saved) ? "saved" : "unsaved" };
};

const withBasics = (s: EditorState, change: Partial<Basics>) =>
  edited(s, { doc: { ...s.doc, basics: { ...s.doc.basics, ...change } } });

// `list` with the item at `from` moved to index `to` (kept inside the list).
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item);
  return next;
}

const withSections = (s: EditorState, change: (sections: Section[]) => Section[]) =>
  edited(s, { doc: { ...s.doc, sections: change(s.doc.sections) } });

const inSection = (sections: Section[], id: string, change: (section: Section) => Section) =>
  sections.map((section) => (section.id === id ? change(section) : section));

const inEntry = (s: EditorState, section: string, id: string, change: (entry: Entry) => Entry) =>
  withSections(s, (all) =>
    inSection(all, section, (sec) => ({ ...sec, entries: sec.entries.map((e) => (e.id === id ? change(e) : e)) })),
  );

// The field an edit types in. Consecutive edits with the same key are one Undo step; structural changes have none.
function groupOf(a: Action): string | null {
  switch (a.type) {
    case "title":
      return "title";
    case "basic":
      return `basic:${a.field}`;
    case "summary":
      return "summary";
    case "privateNotes":
      return "notes";
    case "design":
      return `design:${Object.keys(a.patch).join(",")}`;
    case "photo":
      return `photo:${Object.keys(a.patch).join(",")}`;
    case "field":
      return `field:${a.index}:${a.part}`;
    case "renameSection":
      return `section:${a.id}`;
    case "editEntry":
      return `entry:${a.id}:${Object.keys(a.patch).join(",")}`;
    case "editRole":
      return `role:${a.id}:${Object.keys(a.patch).join(",")}`;
    default:
      return null;
  }
}

const snapshot = (s: EditorState): Snapshot => ({ title: s.title, doc: s.doc });

// Every change of the text goes through here: it records the step for Undo, and a new edit ends what could be redone.
// Saving, loading and the like change no text and leave the history alone (loading starts it again).
export function reduce(s: EditorState, a: Action): EditorState {
  if (a.type === "undo" || a.type === "redo") {
    const [from, to] = a.type === "undo" ? [s.past, s.future] : [s.future, s.past];
    if (from.length === 0) return s;
    const target = from[from.length - 1];
    const rest = from.slice(0, -1);
    const stepped = [...to, snapshot(s)].slice(-HISTORY_LIMIT);
    return {
      ...edited(s, target),
      group: null,
      past: a.type === "undo" ? rest : stepped,
      future: a.type === "undo" ? stepped : rest,
    };
  }
  const next = apply(s, a);
  // A load replaces everything, history included.
  if (a.type === "load" || next === s || sameText(next, s)) return next;
  const group = groupOf(a);
  const joins = group !== null && group === s.group;
  return {
    ...next,
    past: joins ? s.past : [...s.past, snapshot(s)].slice(-HISTORY_LIMIT),
    future: [],
    group,
  };
}

function apply(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case "privateNotes":
      return edited(s, { doc: { ...s.doc, privateNotes: a.value } });
    case "template":
      return edited(s, { doc: { ...s.doc, metadata: { ...s.doc.metadata, template: a.value } } });
    case "design":
      return edited(s, { doc: { ...s.doc, metadata: { ...s.doc.metadata, ...a.patch } } });
    case "photo":
      return withBasics(s, { photo: { ...s.doc.basics.photo, ...a.patch } });
    case "resetDesign":
      return edited(s, { doc: { ...s.doc, metadata: resetDesign(s.doc.metadata) } });
    case "placeSection": {
      // A placement that says nothing (the template's column, page 1) is not kept.
      const old = s.doc.metadata.placements.find((p) => p.section === a.section);
      const next = { section: a.section, column: a.column ?? old?.column ?? "", page: a.page ?? old?.page ?? 1 };
      const rest = s.doc.metadata.placements.filter((p) => p.section !== a.section);
      const placements = next.column === "" && next.page === 1 ? rest : [...rest, next];
      return edited(s, { doc: { ...s.doc, metadata: { ...s.doc.metadata, placements } } });
    }
    case "undo":
    case "redo":
      return s;
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
    case "dateFormat":
      return edited(s, { doc: { ...s.doc, metadata: { ...s.doc.metadata, dateFormat: a.value } } });
    case "addSection":
      return withSections(s, (all) => [
        ...all,
        { id: a.id, kind: a.kind, title: DEFAULT_TITLES[a.kind], hidden: false, entries: [] },
      ]);
    case "renameSection":
      return withSections(s, (all) => inSection(all, a.id, (sec) => ({ ...sec, title: a.title })));
    case "toggleSection":
      return withSections(s, (all) => inSection(all, a.id, (sec) => ({ ...sec, hidden: !sec.hidden })));
    case "removeSection":
      return withSections(s, (all) => all.filter((sec) => sec.id !== a.id));
    case "moveSection":
      return withSections(s, (all) =>
        moved(
          all,
          all.findIndex((sec) => sec.id === a.id),
          a.to,
        ),
      );
    case "addEntry":
      return withSections(s, (all) =>
        inSection(all, a.section, (sec) => ({ ...sec, entries: [...sec.entries, blankEntry(a.id)] })),
      );
    case "editEntry":
      return inEntry(s, a.section, a.id, (e) => ({ ...e, ...a.patch }));
    case "duplicateEntry":
      return withSections(s, (all) =>
        inSection(all, a.section, (sec) => {
          const at = sec.entries.findIndex((e) => e.id === a.id);
          if (at < 0) return sec;
          const copy = { ...sec.entries[at], id: a.newId, roles: sec.entries[at].roles.map((r) => ({ ...r })) };
          return { ...sec, entries: [...sec.entries.slice(0, at + 1), copy, ...sec.entries.slice(at + 1)] };
        }),
      );
    case "toggleEntry":
      return inEntry(s, a.section, a.id, (e) => ({ ...e, hidden: !e.hidden }));
    case "removeEntry":
      return withSections(s, (all) =>
        inSection(all, a.section, (sec) => ({ ...sec, entries: sec.entries.filter((e) => e.id !== a.id) })),
      );
    case "moveEntry":
      return withSections(s, (all) =>
        inSection(all, a.section, (sec) => ({
          ...sec,
          entries: moved(
            sec.entries,
            sec.entries.findIndex((e) => e.id === a.id),
            a.to,
          ),
        })),
      );
    case "moveEntryTo": {
      // Only to another section of the same kind, where it goes last.
      const from = s.doc.sections.find((sec) => sec.id === a.section);
      const to = s.doc.sections.find((sec) => sec.id === a.target);
      const entry = from?.entries.find((e) => e.id === a.id);
      if (!from || !to || !entry || from.kind !== to.kind || from.id === to.id) return s;
      return withSections(s, (all) =>
        all.map((sec) =>
          sec.id === from.id
            ? { ...sec, entries: sec.entries.filter((e) => e.id !== a.id) }
            : sec.id === to.id
              ? { ...sec, entries: [...sec.entries, entry] }
              : sec,
        ),
      );
    }
    case "addRole":
      return inEntry(s, a.section, a.entry, (e) => ({
        ...e,
        roles: [...e.roles, { id: a.id, title: "", startDate: "", endDate: "", description: "" }],
      }));
    case "editRole":
      return inEntry(s, a.section, a.entry, (e) => ({
        ...e,
        roles: e.roles.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)),
      }));
    case "removeRole":
      return inEntry(s, a.section, a.entry, (e) => ({ ...e, roles: e.roles.filter((r) => r.id !== a.id) }));
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
