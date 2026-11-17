import type { components } from "@/lib/api/schema";

import type { Metadata } from "./design";

type Doc = components["schemas"]["ResumeDocument"];

// How far Fit to page may go: the page stays readable and printable.
export const LIMITS = { fontSize: 8, margin: 24 };

// The pages the Resume means to have: the page count it was given, or the highest page a section was placed on.
export const intendedPages = (doc: Doc) => Math.max(doc.metadata.pageCount, ...doc.metadata.placements.map((p) => p.page));

// A Resume overflows when it prints on more pages than it means to have.
export const overflows = (printed: number, doc: Doc) => printed > intendedPages(doc);

// The ways to tighten the page, gentlest first, each one tighter than the one before (and including it): Compact
// density, then margins down in steps of 4, then text size down in steps of 1. Settings already tighter than a step are
// left alone, so a step is never looser than what the User has.
export function fitSteps(m: Metadata): Partial<Metadata>[] {
  const steps: Partial<Metadata>[] = [];
  let patch: Partial<Metadata> = {};
  if (m.density !== "compact") steps.push((patch = { ...patch, density: "compact" }));
  for (let margin = m.margin - 4; margin >= LIMITS.margin; margin -= 4) steps.push((patch = { ...patch, margin }));
  for (let fontSize = m.fontSize - 1; fontSize >= LIMITS.fontSize; fontSize--) steps.push((patch = { ...patch, fontSize }));
  return steps;
}

export type Fit = { patch: Partial<Metadata>; tried: number };

// The gentlest step after which the Resume fits its intended pages, or null when even the tightest does not. Every step
// is tighter than the last, so the page count only goes down along the list and a binary search finds the first that
// fits in a few renders. `pagesFor` prints a document and says how many pages it came to. Returns an empty patch when it
// already fits.
export async function fitToPage(doc: Doc, pagesFor: (doc: Doc) => Promise<number>): Promise<Fit | null> {
  const intended = intendedPages(doc);
  let tried = 0;
  const fits = async (patch: Partial<Metadata>) => {
    tried++;
    return (await pagesFor({ ...doc, metadata: { ...doc.metadata, ...patch } })) <= intended;
  };
  if (await fits({})) return { patch: {}, tried };
  const steps = fitSteps(doc.metadata);
  if (steps.length === 0 || !(await fits(steps[steps.length - 1]))) return null;
  let low = 0;
  let high = steps.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (await fits(steps[mid])) high = mid;
    else low = mid + 1;
  }
  return { patch: steps[low], tried };
}
