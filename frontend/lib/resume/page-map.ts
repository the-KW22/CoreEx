import type { Block } from "./blocks";
import type { Rich } from "./html";

// The page map: for each field the Resume prints, the page it landed on and its box, so a click on the page can find
// its field (and, later, Check issues can be pinned and overflow found). It is built from the PDF itself: react-pdf
// does not hand out its layout, but pdfjs reports every text item with its place, and the fields are known in
// reading order from the same blocks the template draws.

/** One field's worth of printed text, and the reference the editor knows the field by. */
export type Segment = { ref: string; text: string };

/** A box on a page, in PDF points, from the top-left corner of the page. */
export type Box = { ref: string; page: number; x: number; y: number; width: number; height: number };

export type PageText = { width: number; height: number; items: { str: string; x: number; y: number; width: number; height: number }[] };

const plain = (rich: Rich[]) =>
  rich.flatMap((b) => (b.kind === "paragraph" ? [b.runs.map((r) => r.text).join("")] : b.items.map((i) => i.map((r) => r.text).join(""))));

// The text each field prints, in the order the template draws it.
export function segmentsOf(blocks: Block[]): Segment[] {
  const out: Segment[] = [];
  const add = (ref: string, text: string) => text.trim() && out.push({ ref, text });
  for (const block of blocks) {
    if (block.kind === "header") {
      add("basics.name", block.name);
      add("basics.headline", block.headline);
      add("basics.email", block.contact.join("  |  "));
    } else if (block.kind === "heading") {
      add(block.ref, block.text);
    } else if (block.kind === "text") {
      plain(block.rich).forEach((t) => add("summary", t));
    } else {
      const ref = (part: string) => `entry:${block.id}:${part}`;
      add(ref("title"), [block.title, block.level].filter(Boolean).join(" - "));
      add(ref("dates"), block.dates);
      add(ref("subtitle"), [block.subtitle, block.location].filter(Boolean).join(", "));
      add(ref("url"), block.url);
      plain(block.rich).forEach((t) => add(ref("description"), t));
      for (const role of block.roles) {
        add(`role:${role.id}:title`, role.title);
        add(`role:${role.id}:dates`, role.dates);
        plain(role.rich).forEach((t) => add(`role:${role.id}:description`, t));
      }
      add(ref("keywords"), block.keywords.join(", "));
    }
  }
  return out;
}

// Spaces and case do not matter: lines wrap, headings print in capitals, list markers sit in items of their own.
const squish = (text: string) => text.replace(/\s+/g, "").toLowerCase();

// Finds each segment in the printed items, in order. A segment that cannot be found gets no box and the search goes on
// from where it was, so one odd field never hides the ones after it.
export function buildPageMap(segments: Segment[], pages: PageText[]): Box[] {
  const flat = pages.flatMap((page, p) => page.items.map((item) => ({ ...item, page: p, key: squish(item.str) })).filter((i) => i.key));
  const boxes: Box[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const want = squish(segment.text);
    const start = flat.findIndex((item, i) => i >= cursor && want.startsWith(item.key));
    if (start < 0) continue;
    let have = "";
    let end = start;
    while (end < flat.length && have.length < want.length && want.startsWith(have + flat[end].key)) {
      have += flat[end].key;
      end++;
    }
    if (have !== want) continue;
    cursor = end;
    // One box per page the field touches: the union of its items there.
    for (let p = flat[start].page; p <= flat[end - 1].page; p++) {
      const items = flat.slice(start, end).filter((i) => i.page === p);
      if (items.length === 0) continue;
      const left = Math.min(...items.map((i) => i.x));
      const right = Math.max(...items.map((i) => i.x + i.width));
      const top = Math.min(...items.map((i) => pages[p].height - i.y - i.height));
      const bottom = Math.max(...items.map((i) => pages[p].height - i.y));
      boxes.push({ ref: segment.ref, page: p + 1, x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return boxes;
}

type PdfPageLike = {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: object[] }>;
};

// The text items of every page of a loaded pdfjs document.
export async function readPages(pdf: { numPages: number; getPage(n: number): Promise<PdfPageLike> }): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.flatMap((raw) => {
      const item = raw as { str?: string; transform?: number[]; width?: number; height?: number };
      return item.str && item.transform
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width ?? 0, height: item.height ?? 0 }]
        : [];
    });
    pages.push({ width, height, items });
  }
  return pages;
}
