import type { components } from "@/lib/api/schema";

import { type Rich, parseRich } from "./html";

type Doc = components["schemas"]["ResumeDocument"];

// What a template draws, in order. Templates differ in how they draw these, never in what is drawn, so the page map
// and the checks of later tickets can read the same list.
export type Block =
  | { kind: "header"; name: string; headline: string; contact: string[] }
  | { kind: "heading"; text: string }
  | { kind: "text"; rich: Rich[] }
  | { kind: "entry"; title: string; subtitle: string; location: string; dates: string; url: string; rich: Rich[]; keywords: string[] };

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export function resumeBlocks(doc: Doc): Block[] {
  const { basics } = doc;
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
  if (summary.length) blocks.push({ kind: "heading", text: "Summary" }, { kind: "text", rich: summary });
  for (const section of doc.sections) {
    const entries = section.entries.filter((e) => !e.hidden);
    if (section.hidden || entries.length === 0) continue;
    blocks.push({ kind: "heading", text: section.title.trim() || section.kind });
    for (const e of entries) {
      // shortcut: dates print as typed, upgrade to the chosen date format with the sections ticket (#246).
      const dates = [e.startDate, e.endDate].map((d) => d.trim()).filter(Boolean).join(" - ");
      blocks.push({
        kind: "entry",
        title: e.title.trim(),
        subtitle: e.subtitle.trim(),
        location: e.location.trim(),
        dates,
        url: e.url.trim(),
        rich: parseRich(e.description),
        keywords: clean(e.keywords),
      });
    }
  }
  return blocks;
}
