import type { components } from "@/lib/api/schema";

import { formatSpan } from "./dates";
import { type Rich, parseRich } from "./html";

type Doc = components["schemas"]["ResumeDocument"];

// What a template draws, in order. Templates differ in how they draw these, never in what is drawn, so the page map
// and the checks of later tickets can read the same list. `column` says where the Sidebar template puts a block; the
// other templates draw everything in one column.
export type Column = "side" | "main";
export type RoleBlock = { id: string; title: string; dates: string; rich: Rich[] };
export type Block =
  | { kind: "header"; name: string; headline: string; contact: string[] }
  // `ref` names the field a click on it should open: "summary" or "section:<id>".
  | { kind: "heading"; text: string; ref: string; column: Column }
  | { kind: "text"; rich: Rich[]; column: Column }
  | {
      kind: "entry";
      id: string;
      column: Column;
      title: string;
      subtitle: string;
      location: string;
      dates: string;
      url: string;
      level: string;
      rich: Rich[];
      roles: RoleBlock[];
      keywords: string[];
    };

export type Template = "classic" | "sidebar" | "modern";
export const TEMPLATES: { value: Template; label: string; about: string }[] = [
  { value: "classic", label: "Classic", about: "One column, plain and easy for hiring software to read." },
  { value: "sidebar", label: "Sidebar", about: "Two columns: skills and languages beside the main story." },
  { value: "modern", label: "Modern", about: "One column under a colour header." },
];
// A name the editor does not know (from an import or an Agent) draws as Classic.
export const templateOf = (doc: Doc): Template => TEMPLATES.find((t) => t.value === doc.metadata.template)?.value ?? "classic";

// The sections the Sidebar template keeps in its narrow column: short lists rather than stories.
const SIDE_KINDS = ["SKILLS", "LANGUAGES", "INTERESTS", "CERTIFICATIONS", "PROFILES"];

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export function resumeBlocks(doc: Doc): Block[] {
  const { basics } = doc;
  const format = doc.metadata.dateFormat;
  const sidebar = templateOf(doc) === "sidebar";
  const header: Block = {
    kind: "header",
    name: basics.name.trim(),
    headline: basics.headline.trim(),
    contact: clean([
      basics.email,
      basics.phone,
      basics.location,
      basics.website,
      ...basics.customFields.map((f) => (f.label.trim() ? `${f.label.trim()}: ${f.value.trim()}` : f.value)),
    ]),
  };
  const main: Block[] = [];
  const side: Block[] = [];
  const summary = parseRich(doc.summary);
  if (summary.length) main.push({ kind: "heading", text: "Summary", ref: "summary", column: "main" }, { kind: "text", rich: summary, column: "main" });
  for (const section of doc.sections) {
    const entries = section.entries.filter((e) => !e.hidden);
    if (section.hidden || entries.length === 0) continue;
    const column: Column = sidebar && SIDE_KINDS.includes(section.kind) ? "side" : "main";
    const into = column === "side" ? side : main;
    into.push({ kind: "heading", text: section.title.trim() || section.kind, ref: `section:${section.id}`, column });
    for (const e of entries) {
      into.push({
        kind: "entry",
        id: e.id,
        column,
        title: e.title.trim(),
        subtitle: e.subtitle.trim(),
        location: e.location.trim(),
        dates: formatSpan(e.startDate, e.endDate, format),
        url: e.url.trim(),
        level: e.level.trim(),
        rich: parseRich(e.description),
        roles: e.roles.map((r) => ({
          id: r.id,
          title: r.title.trim(),
          dates: formatSpan(r.startDate, r.endDate, format),
          rich: parseRich(r.description),
        })),
        keywords: clean(e.keywords),
      });
    }
  }
  // The sidebar is drawn before the main column, so it comes first in the order the page map reads.
  return [header, ...side, ...main];
}
