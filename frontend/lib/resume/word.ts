import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { components } from "../api/schema";
import { resumeBlocks } from "./blocks";
import type { Rich, Run } from "./html";

type Doc = components["schemas"]["ResumeDocument"];

function runs(items: Run[]) {
  return items.map((r) => {
    const text = r.text.split("\n").map((part, index) => new TextRun({ text: part, break: index ? 1 : undefined, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined }));
    return r.href && /^(https?:|mailto:)/i.test(r.href)
      ? [new ExternalHyperlink({ link: r.href, children: text })] : text;
  }).flat();
}

function rich(blocks: Rich[]): Paragraph[] {
  const alignment = { left: AlignmentType.START, center: AlignmentType.CENTER, right: AlignmentType.END, justify: AlignmentType.BOTH };
  return blocks.flatMap((block) => block.kind === "paragraph"
    ? [new Paragraph({ children: runs(block.runs), alignment: block.align ? alignment[block.align] : undefined })]
    : block.items.map((item) => new Paragraph({ children: runs(item), ...(block.ordered
      ? { numbering: { reference: "list", level: 0 } } : { bullet: { level: 0 } }) })));
}

export async function resumeWord(doc: Doc, letter = false): Promise<Blob> {
  const paragraphs: Paragraph[] = [];
  const line = (text: string, heading?: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2 | typeof HeadingLevel.HEADING_3) => {
    if (text) paragraphs.push(new Paragraph({ text, heading }));
  };
  for (const block of resumeBlocks(doc, letter)) {
    if (block.kind === "header") {
      line(block.name, HeadingLevel.HEADING_1);
      line(block.headline);
      line(block.contact.join(" | "));
    } else if (block.kind === "heading") line(block.text, HeadingLevel.HEADING_2);
    else if (block.kind === "text") paragraphs.push(...rich(block.rich));
    else {
      line(block.title, HeadingLevel.HEADING_3);
      line([block.subtitle, block.location, block.dates, block.level].filter(Boolean).join(" | "));
      if (block.url) paragraphs.push(new Paragraph({ children: runs([{ text: block.url, href: block.url }]) }));
      paragraphs.push(...rich(block.rich));
      for (const role of block.roles) {
        line([role.title, role.dates].filter(Boolean).join(" | "));
        paragraphs.push(...rich(role.rich));
      }
      line(block.keywords.join(", "));
    }
  }
  return Packer.toBlob(new Document({ numbering: { config: [{ reference: "list", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] }, sections: [{ children: paragraphs }] }));
}
