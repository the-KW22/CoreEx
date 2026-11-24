export type DiffLine = { kind: "same" | "add" | "del"; text: string };

// CRLF and LF count alike; an empty text has no lines at all (so "" is no line, not one empty line).
const split = (text: string) => (text === "" ? [] : text.split(/\r?\n/));

const MAX_CELLS = 4_000_000;

// shortcut: the longest-common-subsequence table is lines x lines in memory, fine for Note-sized text, upgrade to Myers diff if Notes get very long.
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = split(before);
  const b = split(after);
  // Past this size the table would use too much memory: show the whole text as replaced rather than freeze the page.
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text): DiffLine => ({ kind: "del", text })), ...b.map((text): DiffLine => ({ kind: "add", text }))];
  }
  // lcs[i][j]: the longest common run of lines in a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) {
      // Deletions come first on a tie, so a changed line reads as removed then added.
      out.push({ kind: "del", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  return out;
}
