import { lineDiff } from "@/lib/line-diff";

// What to draw on a Note's own text to show a Proposal: the lines it removes (by line number, from 0) and the lines it
// adds, each group put after the line it follows (-1: before the first line).
export type Marks = { deleted: number[]; added: { after: number; lines: string[] }[] };

export function proposalMarks(before: string, after: string): Marks {
  const marks: Marks = { deleted: [], added: [] };
  let line = -1; // The last line of `before` passed so far.
  for (const d of lineDiff(before, after)) {
    if (d.kind === "add") {
      const last = marks.added.at(-1);
      if (last && last.after === line) last.lines.push(d.text);
      else marks.added.push({ after: line, lines: [d.text] });
    } else {
      line++;
      if (d.kind === "del") marks.deleted.push(line);
    }
  }
  return marks;
}

// The editor holds the text with plain line ends, so a stored text with CRLF is compared the same way.
export const sameText = (a: string, b: string) => a.replace(/\r\n?/g, "\n") === b.replace(/\r\n?/g, "\n");
