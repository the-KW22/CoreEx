import { describe, expect, it } from "vitest";
import { SAMPLE } from "./sample";
import { checkResume } from "./check";

const doc = () => structuredClone(SAMPLE);

describe("Resume Check", () => {
  it.each([
    ["contact-name", (d: ReturnType<typeof doc>) => { d.basics.name = ""; }],
    ["contact-email-invalid", (d: ReturnType<typeof doc>) => { d.basics.email = "broken"; }],
    ["contact-phone", (d: ReturnType<typeof doc>) => { d.basics.phone = ""; }],
    ["contact-location", (d: ReturnType<typeof doc>) => { d.basics.location = ""; }],
    ["contact-url", (d: ReturnType<typeof doc>) => { d.basics.website = "broken"; }],
    ["contact-photo", (d: ReturnType<typeof doc>) => { d.basics.photo.assetId = "photo"; }],
    ["layout-margin", (d: ReturnType<typeof doc>) => { d.metadata.margin = 20; }],
    ["layout-columns", (d: ReturnType<typeof doc>) => { d.metadata.template = "sidebar"; }],
    ["layout-entry-columns", (d: ReturnType<typeof doc>) => { d.metadata.entryColumns = 2; }],
    ["heading-nonstandard-experience", (d: ReturnType<typeof doc>) => { d.sections[0].title = "Adventures"; }],
    ["layout-sidebar-experience", (d: ReturnType<typeof doc>) => { d.metadata.template = "sidebar"; d.metadata.placements = [{ section: "experience", page: 1, column: "side" }]; }],
    ["heading-experience", (d: ReturnType<typeof doc>) => { d.sections[0].hidden = true; }],
    ["writing-exp-1", (d: ReturnType<typeof doc>) => { d.sections[0].entries[0].description = ""; }],
    ["dates-missing-exp-1", (d: ReturnType<typeof doc>) => { d.sections[0].entries[0].startDate = ""; d.sections[0].entries[0].endDate = ""; }],
    ["dates-invalid-exp-1", (d: ReturnType<typeof doc>) => { d.sections[0].entries[0].startDate = "not-a-date"; }],
    ["dates-future-exp-1", (d: ReturnType<typeof doc>) => { d.sections[0].entries[0].startDate = "2999"; }],
  ] as const)("checks %s only when it applies", (id, edit) => {
    expect(checkResume(doc()).issues.map((i) => i.id)).not.toContain(id);
    const bad = doc(); edit(bad);
    expect(checkResume(bad).issues.map((i) => i.id)).toContain(id);
  });
  it("checks contact details", () => {
    const bad = doc(); bad.basics.email = "";
    expect(checkResume(bad).issues.map((i) => i.id)).toContain("contact-email");
    expect(checkResume(doc()).issues.map((i) => i.id)).not.toContain("contact-email");
  });
  it("checks date order", () => {
    const bad = doc(); bad.sections[0].entries[0].startDate = "2025-01"; bad.sections[0].entries[0].endDate = "2024-01";
    expect(checkResume(bad).issues.some((i) => i.id.startsWith("dates-"))).toBe(true);
    expect(checkResume(doc()).issues.some((i) => i.id.startsWith("dates-"))).toBe(false);
  });
  it("checks small text", () => {
    const bad = doc(); bad.metadata.fontSize = 8;
    expect(checkResume(bad).issues.map((i) => i.id)).toContain("layout-font-size");
    expect(checkResume(doc()).issues.map((i) => i.id)).not.toContain("layout-font-size");
  });
  it("checks blank headings", () => {
    const bad = doc(); bad.sections[0].title = "";
    expect(checkResume(bad).issues.some((i) => i.id.startsWith("heading-"))).toBe(true);
    expect(checkResume(doc()).issues.some((i) => i.id.startsWith("heading-"))).toBe(false);
  });
  it("checks missing summary", () => {
    const bad = doc(); bad.summary = "";
    expect(checkResume(bad).issues.map((i) => i.id)).toContain("writing-summary");
    expect(checkResume(doc()).issues.map((i) => i.id)).not.toContain("writing-summary");
  });
  it("excludes ignored issues from the score", () => {
    const bad = doc(); bad.basics.email = "";
    const before = checkResume(bad); bad.ignoredChecks = ["contact-email"];
    const after = checkResume(bad);
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.issues.find((i) => i.id === "contact-email")?.ignored).toBe(true);
  });
});
