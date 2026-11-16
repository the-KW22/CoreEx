import type { components } from "@/lib/api/schema";

import { formatSpan } from "./dates";
import { type Rich, parseRich } from "./html";

type Doc = components["schemas"]["ResumeDocument"];

// What a template draws, in order. Templates differ in how they draw these, never in what is drawn, so the page map
// and the checks of later tickets can read the same list.
export type RoleBlock = { id: string; title: string; dates: string; rich: Rich[] };
export type Block =
  | { kind: "header"; name: string; headline: string; contact: string[] }
  // `ref` names the field a click on it should open: "summary" or "section:<id>".
  | { kind: "heading"; text: string; ref: string }
  | { kind: "text"; rich: Rich[] }
  | {
      kind: "entry";
      id: string;
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

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export function resumeBlocks(doc: Doc): Block[] {
  const { basics } = doc;
  const format = doc.metadata.dateFormat;
  const blocks: Block[] = [
    {
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
    },
  ];
  const summary = parseRich(doc.summary);
  if (summary.length) blocks.push({ kind: "heading", text: "Summary", ref: "summary" }, { kind: "text", rich: summary });
  for (const section of doc.sections) {
    const entries = section.entries.filter((e) => !e.hidden);
    if (section.hidden || entries.length === 0) continue;
    blocks.push({ kind: "heading", text: section.title.trim() || section.kind, ref: `section:${section.id}` });
    for (const e of entries) {
      blocks.push({
        kind: "entry",
        id: e.id,
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
  return blocks;
}
