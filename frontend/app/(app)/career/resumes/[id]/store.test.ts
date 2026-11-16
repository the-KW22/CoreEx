import { describe, expect, it } from "vitest";

import { init, mineTitle, moved, reduce, type EditorState, type ResumeDocument } from "./store";

const doc: ResumeDocument = {
  locale: "en",
  basics: { name: "Ada", headline: "", email: "", phone: "", location: "", website: "", customFields: [] },
  summary: "<p></p>",
  sections: [],
  metadata: { template: "classic", accent: "#1d4ed8", font: "Inter", fontSize: 10, pageSize: "A4", dateFormat: "MMM_YYYY" },
  privateNotes: "",
  ignoredChecks: [],
};

describe("the editor store", () => {
  it("an edit makes the text unsaved, and undoing it by hand makes it saved again", () => {
    const edited = reduce(init("CV", doc, 1), { type: "basic", field: "name", value: "Ada L" });
    expect(edited.status).toBe("unsaved");
    expect(edited.doc.basics.name).toBe("Ada L");
    expect(reduce(edited, { type: "basic", field: "name", value: "Ada" }).status).toBe("saved");
  });

  it("a save keeps text typed meanwhile unsaved and takes the new counter", () => {
    const first = reduce(init("CV", doc, 1), { type: "summary", html: "<p>a</p>" });
    const sent = { title: first.title, doc: first.doc };
    const typed = reduce(first, { type: "summary", html: "<p>ab</p>" });
    const done = reduce(typed, { type: "savedAs", sent, version: 2 });
    expect(done.version).toBe(2);
    expect(done.status).toBe("unsaved");
    expect(reduce(first, { type: "savedAs", sent, version: 2 }).status).toBe("saved");
  });

  it("custom contact fields are added, edited and removed", () => {
    let s = reduce(init("CV", doc, 1), { type: "addField" });
    s = reduce(s, { type: "field", index: 0, part: "label", value: "GitHub" });
    s = reduce(s, { type: "field", index: 0, part: "value", value: "ada" });
    expect(s.doc.basics.customFields).toEqual([{ label: "GitHub", value: "ada" }]);
    expect(reduce(s, { type: "removeField", index: 0 }).doc.basics.customFields).toEqual([]);
  });

  it("a failed save shows an error and loading replaces everything", () => {
    expect(reduce(init("CV", doc, 1), { type: "failed" }).status).toBe("error");
    const loaded = reduce(init("CV", doc, 1), { type: "load", title: "T", doc, version: 5 });
    expect(loaded).toMatchObject({ title: "T", version: 5, status: "saved" });
  });

  it("restored text shows as unsaved", () => {
    const restored = reduce(init("CV", doc, 1), { type: "restore", title: "CV", doc: { ...doc, summary: "<p>back</p>" } });
    expect(restored.status).toBe("unsaved");
    expect(restored.saved.doc.summary).toBe("<p></p>");
  });

  it("the copy's title fits 200 characters", () => {
    expect(mineTitle("CV")).toBe("CV (mine)");
    expect(mineTitle("x".repeat(300))).toHaveLength(200);
    expect(mineTitle("  ")).toBe("Untitled (mine)");
  });
});

describe("Undo and Redo", () => {
  const type = (s: EditorState, text: string, field: "name" | "headline" = "name") =>
    [...text].reduce((acc, _, i) => reduce(acc, { type: "basic", field, value: text.slice(0, i + 1) }), s);

  it("typing a sentence in one field is one step", () => {
    const typed = type(init("CV", doc, 1), "Ada Lovelace");
    expect(typed.past).toHaveLength(1);
    const undone = reduce(typed, { type: "undo" });
    expect(undone.doc.basics.name).toBe("Ada");
    expect(undone.status).toBe("saved");
    expect(reduce(undone, { type: "redo" }).doc.basics.name).toBe("Ada Lovelace");
  });

  it("another field, or another kind of change, starts a new step", () => {
    let s = type(init("CV", doc, 1), "Ada");
    s = type(s, "Analyst", "headline");
    s = reduce(s, { type: "addSection", id: "a", kind: "SKILLS" });
    expect(s.past).toHaveLength(3);
    s = reduce(s, { type: "undo" });
    expect(s.doc.sections).toEqual([]);
    expect(s.doc.basics.headline).toBe("Analyst");
  });

  it("a new edit clears what could be redone", () => {
    let s = reduce(type(init("CV", doc, 1), "Ada"), { type: "undo" });
    expect(s.future).toHaveLength(1);
    s = reduce(s, { type: "basic", field: "name", value: "Bee" });
    expect(s.future).toEqual([]);
  });

  it("keeps the newest 200 steps", () => {
    let s = init("CV", doc, 1);
    for (let i = 0; i < 250; i++) s = reduce(s, { type: "addSection", id: `s${i}`, kind: "SKILLS" });
    expect(s.past).toHaveLength(200);
    for (let i = 0; i < 200; i++) s = reduce(s, { type: "undo" });
    expect(s.doc.sections).toHaveLength(50);
    expect(reduce(s, { type: "undo" })).toBe(s);
  });

  it("saving does not touch the history, and loading starts it again", () => {
    const typed = type(init("CV", doc, 1), "Grace");
    const saved = reduce(typed, { type: "savedAs", sent: { title: typed.title, doc: typed.doc }, version: 2 });
    expect(saved.past).toHaveLength(1);
    // Undoing past a save leaves the text unsaved again.
    expect(reduce(saved, { type: "undo" }).status).toBe("unsaved");
    expect(reduce(saved, { type: "load", title: "T", doc, version: 3 }).past).toEqual([]);
  });

  it("choosing a template is one undoable step", () => {
    const s = reduce(init("CV", doc, 1), { type: "template", value: "sidebar" });
    expect(s.doc.metadata.template).toBe("sidebar");
    expect(reduce(s, { type: "undo" }).doc.metadata.template).toBe("classic");
  });

  it("private notes are an ordinary edit", () => {
    expect(reduce(init("CV", doc, 1), { type: "privateNotes", value: "sent to Acme" }).doc.privateNotes).toBe("sent to Acme");
  });
});

describe("sections and entries", () => {
  const run = (s: EditorState, ...actions: Parameters<typeof reduce>[1][]) => actions.reduce(reduce, s);
  const start = () =>
    run(
      init("CV", doc, 1),
      { type: "addSection", id: "a", kind: "EXPERIENCE" },
      { type: "addSection", id: "b", kind: "EXPERIENCE" },
      { type: "addSection", id: "c", kind: "SKILLS" },
    );

  it("a new section takes its kind's name, and can be renamed, hidden, moved and removed", () => {
    let s = start();
    expect(s.doc.sections.map((x) => x.title)).toEqual(["Experience", "Experience", "Skills"]);
    s = run(s, { type: "renameSection", id: "b", title: "Past jobs" }, { type: "toggleSection", id: "c" });
    expect(s.doc.sections[1].title).toBe("Past jobs");
    expect(s.doc.sections[2].hidden).toBe(true);
    s = run(s, { type: "moveSection", id: "c", to: 0 });
    expect(s.doc.sections.map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(run(s, { type: "removeSection", id: "a" }).doc.sections.map((x) => x.id)).toEqual(["c", "b"]);
    expect(s.status).toBe("unsaved");
  });

  it("entries are added, edited, duplicated next to the original, hidden and deleted", () => {
    let s = run(
      start(),
      { type: "addEntry", section: "a", id: "e1" },
      { type: "editEntry", section: "a", id: "e1", patch: { title: "Dev", level: "Senior" } },
    );
    s = run(s, { type: "duplicateEntry", section: "a", id: "e1", newId: "e2" }, { type: "addEntry", section: "a", id: "e3" });
    expect(s.doc.sections[0].entries.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(s.doc.sections[0].entries[1]).toMatchObject({ title: "Dev", level: "Senior" });
    s = run(s, { type: "toggleEntry", section: "a", id: "e2" }, { type: "removeEntry", section: "a", id: "e3" });
    expect(s.doc.sections[0].entries.map((e) => [e.id, e.hidden])).toEqual([
      ["e1", false],
      ["e2", true],
    ]);
  });

  it("entries reorder, and move only to another section of the same kind", () => {
    let s = run(start(), { type: "addEntry", section: "a", id: "e1" }, { type: "addEntry", section: "a", id: "e2" });
    s = run(s, { type: "moveEntry", section: "a", id: "e2", to: 0 });
    expect(s.doc.sections[0].entries.map((e) => e.id)).toEqual(["e2", "e1"]);
    const same = run(s, { type: "moveEntryTo", section: "a", id: "e2", target: "b" });
    expect(same.doc.sections[0].entries.map((e) => e.id)).toEqual(["e1"]);
    expect(same.doc.sections[1].entries.map((e) => e.id)).toEqual(["e2"]);
    // Skills is another kind: nothing moves.
    expect(run(s, { type: "moveEntryTo", section: "a", id: "e2", target: "c" })).toBe(s);
  });

  it("roles of one entry are added, edited and removed", () => {
    let s = run(start(), { type: "addEntry", section: "a", id: "e1" }, { type: "addRole", section: "a", entry: "e1", id: "r1" });
    s = run(s, { type: "editRole", section: "a", entry: "e1", id: "r1", patch: { title: "Lead", endDate: "present" } });
    expect(s.doc.sections[0].entries[0].roles).toEqual([
      { id: "r1", title: "Lead", startDate: "", endDate: "present", description: "" },
    ]);
    expect(run(s, { type: "removeRole", section: "a", entry: "e1", id: "r1" }).doc.sections[0].entries[0].roles).toEqual([]);
  });

  it("the date format is part of the document", () => {
    expect(run(init("CV", doc, 1), { type: "dateFormat", value: "YYYY" }).doc.metadata.dateFormat).toBe("YYYY");
  });

  it("moved keeps the index inside the list", () => {
    expect(moved([1, 2, 3], 0, 9)).toEqual([2, 3, 1]);
    expect(moved([1, 2, 3], 2, -4)).toEqual([3, 1, 2]);
    expect(moved([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });
});
