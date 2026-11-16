import type { PageText } from "./page-map";

export const extractedText = (pages: PageText[]) => pages.map((p) => p.items.map((i) => i.str).join(" ")).join("\n\n");

const normalise = (text: string) => text.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]/gu, "");

export function comparePdfText(expected: string[], actual: string): ("missing" | "out-of-order" | "not-selectable")[] {
  const parts = expected.map(normalise).filter(Boolean);
  const text = normalise(actual);
  if (parts.length && !text) return ["not-selectable"];
  let cursor = 0;
  let missing = false;
  let outOfOrder = false;
  for (const part of parts) {
    const at = text.indexOf(part, cursor);
    if (at >= 0) cursor = at + part.length;
    else if (text.includes(part)) outOfOrder = true;
    else missing = true;
  }
  return [...(missing ? ["missing" as const] : []), ...(outOfOrder ? ["out-of-order" as const] : [])];
}
