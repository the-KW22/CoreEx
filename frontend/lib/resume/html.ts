import { parseDocument } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";

// A piece of text with the same look. The HTML is already sanitised by the backend (ADR 0011), so only the marks the
// editor makes are read here; htmlparser2 because a Web Worker and a Node route have no DOM to parse with.
export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; href?: string };
export type Rich =
  | { kind: "paragraph"; align?: "left" | "center" | "right" | "justify"; runs: Run[] }
  | { kind: "list"; ordered: boolean; items: Run[][] };

type Look = Omit<Run, "text">;

const style = (el: Element, name: string) => {
  const found = (el.attribs.style ?? "").split(";").map((d) => d.split(":").map((s) => s.trim()));
  return found.find(([key]) => key?.toLowerCase() === name)?.[1];
};

function runs(nodes: ChildNode[], look: Look = {}): Run[] {
  return nodes.flatMap((node): Run[] => {
    if (node.type === "text") return node.data ? [{ ...look, text: node.data }] : [];
    if (node.type !== "tag") return [];
    const el = node as Element;
    if (el.name === "br") return [{ ...look, text: "\n" }];
    const next: Look = { ...look };
    if (el.name === "strong" || el.name === "b") next.bold = true;
    if (el.name === "em" || el.name === "i") next.italic = true;
    if (el.name === "u") next.underline = true;
    if (el.name === "a" && el.attribs.href) next.href = el.attribs.href;
    const color = style(el, "color");
    if (color) next.color = color;
    return runs(el.children, next);
  });
}

const ALIGNS = ["left", "center", "right", "justify"] as const;

export function parseRich(html: string): Rich[] {
  const blocks: Rich[] = [];
  for (const node of parseDocument(html).children) {
    if (node.type !== "tag") continue;
    const el = node as Element;
    if (el.name === "ul" || el.name === "ol") {
      const items = el.children.filter((c): c is Element => c.type === "tag" && (c as Element).name === "li");
      blocks.push({ kind: "list", ordered: el.name === "ol", items: items.map((li) => runs(li.children)) });
    } else if (el.name === "p") {
      const align = ALIGNS.find((a) => a === style(el, "text-align"));
      blocks.push({ kind: "paragraph", align, runs: runs(el.children) });
    }
  }
  return blocks.filter((b) => (b.kind === "list" ? b.items.length > 0 : b.runs.some((r) => r.text.trim())));
}
