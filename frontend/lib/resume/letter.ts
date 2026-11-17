import type { components } from "../api/schema";
import { parseRich } from "./html";

type Letter = components["schemas"]["CoverLetterDocument"];
type Doc = components["schemas"]["ResumeDocument"];

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

export function letterForPdf(letter: Letter): Doc {
  const paragraph = (text: string) => text.trim() ? `<p>${escape(text)}</p>` : "";
  return {
    locale: "en",
    basics: letter.sender,
    summary: [paragraph(letter.recipient), paragraph(letter.date), paragraph(letter.greeting), letter.body, paragraph(letter.signOff)].join(""),
    sections: [],
    metadata: letter.design,
    privateNotes: "",
    ignoredChecks: [],
  };
}

export function letterWords(letter: Letter) {
  const text = parseRich(letter.body).flatMap((block) => block.kind === "paragraph" ? block.runs : block.items.flat()).map((run) => run.text).join(" ");
  return text.trim().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
