import { describe, expect, it } from "vitest";

import { init, mineTitle, reduce, type ResumeDocument } from "./store";

const doc: ResumeDocument = {
  locale: "en",
  basics: { name: "Ada", headline: "", email: "", phone: "", location: "", website: "", customFields: [] },
  summary: "<p></p>",
  sections: [],
  metadata: { template: "classic", accent: "#1d4ed8", font: "Inter", fontSize: 10, pageSize: "A4" },
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
