import { LINK_TOKEN, readLink } from "./links";

// The stored Link around a position in the text, ends included, on that position's line. Null when there is none,
// or when the Link is a hand-typed title without an id.
export function linkAt(text: string, pos: number): { id: string; from: number; to: number } | null {
  const start = text.lastIndexOf("\n", pos - 1) + 1;
  const end = text.indexOf("\n", pos);
  const line = text.slice(start, end === -1 ? text.length : end);
  for (const match of line.matchAll(LINK_TOKEN)) {
    const from = start + match.index;
    const to = from + match[0].length;
    if (pos < from || pos > to) continue;
    const link = readLink(match[1]);
    return link && "id" in link ? { id: link.id, from, to } : null;
  }
  return null;
}

// The words a reader sees: Links as their text, without Markdown marks.
function plain(body: string): string {
  return body
    .replace(LINK_TOKEN, (_, inner: string) => {
      const link = readLink(inner);
      return !link ? "" : "id" in link ? link.text : link.title;
    })
    .replace(/^\s*(#{1,6}|[-*+]|\d+[.)]|>)\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/[*_~`]/g, "");
}

export const wordCount = (body: string) => plain(body).split(/\s+/).filter(Boolean).length;

// The opening text for a Link preview: plain words, cut at a word with "…" when longer than `max`.
export function firstLines(body: string, max = 160): string {
  const text = plain(body).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trimEnd()}…`;
}

// The Note's title as its first line says it: "# Heading" gives "Heading". Any other first line says nothing.
export function titleFromBody(body: string): string | null {
  const match = /^#[ \t]+(.*?)\s*$/.exec(body.split("\n", 1)[0]);
  return match ? match[1] : null;
}

// The body with its first line as "# title": that line is rewritten when it already is a heading, and put in front when
// it is not. An empty title leaves the body alone.
export function withHeading(body: string, title: string): string {
  const text = title.trim();
  if (!text) return body;
  const end = body.indexOf("\n");
  const first = end === -1 ? body : body.slice(0, end);
  if (/^#[ \t]+/.test(first)) return `# ${text}${end === -1 ? "" : body.slice(end)}`;
  // An empty Note gets a second line too, so there is somewhere to write under the heading.
  return `# ${text}\n${body}`;
}
