import type { components } from "@/lib/api/schema";

import { formatSpan } from "./dates";
import { type Rich, parseRich } from "./html";

type Doc = components["schemas"]["ResumeDocument"];

// What a template draws, in order. Templates differ in how they draw these, never in what is drawn, so the page map
// and the checks of later tickets can read the same list. `column` says where the Sidebar template puts a block (the
// other templates draw everything in one column) and `page` which page it is drawn on.
export type Column = "side" | "main";
export type RoleBlock = { id: string; title: string; dates: string; rich: Rich[] };
export type Block =
  | { kind: "header"; name: string; headline: string; contact: string[] }
  // `ref` names the field a click on it should open: "summary" or "section:<id>".
  | { kind: "heading"; text: string; ref: string; column: Column; page: number }
  | { kind: "text"; rich: Rich[]; column: Column; page: number }
  | {
      kind: "entry";
      id: string;
      column: Column;
      page: number;
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

// The sections the Sidebar template keeps in its narrow column unless told otherwise: short lists rather than stories.
export const SIDE_KINDS = ["SKILLS", "LANGUAGES", "INTERESTS", "CERTIFICATIONS", "PROFILES"];

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export function resumeBlocks(doc: Doc): Block[] {
  const { basics } = doc;
  const format = doc.metadata.dateFormat;
  const sidebar = templateOf(doc) === "sidebar";
  const placed = new Map(doc.metadata.placements.map((p) => [p.section, p]));
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
  // Per page, the sidebar's blocks and the main column's.
  const pages = new Map<number, { side: Block[]; main: Block[] }>();
  const into = (page: number, column: Column) => {
    if (!pages.has(page)) pages.set(page, { side: [], main: [] });
    return pages.get(page)![column];
  };
  const summary = parseRich(doc.summary);
  if (summary.length) {
    into(1, "main").push({ kind: "heading", text: "Summary", ref: "summary", column: "main", page: 1 }, { kind: "text", rich: summary, column: "main", page: 1 });
  }
  for (const section of doc.sections) {
    const entries = section.entries.filter((e) => !e.hidden);
    if (section.hidden || entries.length === 0) continue;
    const where = placed.get(section.id);
    const page = where?.page ?? 1;
    // Only the Sidebar template has a sidebar: elsewhere everything is the main column.
    const column: Column = sidebar && (where?.column ? where.column === "side" : SIDE_KINDS.includes(section.kind)) ? "side" : "main";
    const list = into(page, column);
    list.push({ kind: "heading", text: section.title.trim() || section.kind, ref: `section:${section.id}`, column, page });
    for (const e of entries) {
      list.push({
        kind: "entry",
        id: e.id,
        column,
        page,
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
  // The order the pages are drawn in: page by page, the sidebar before the main column, so the page map reads them right.
  const ordered = [...pages.entries()].sort(([a], [b]) => a - b).flatMap(([, { side, main }]) => [...side, ...main]);
  return [header, ...ordered];
}
