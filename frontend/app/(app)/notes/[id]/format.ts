import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState, type StateCommand } from "@codemirror/state";

// The formatting the toolbar offers: only what Markdown can express (ADR 0002), as commands on the editor's state.
// A command wraps or prefixes the selection, or undoes that when it is already there.

// How long to wait for the Markdown parser when the toolbar asks what is at the caret.
const PARSE_MS = 50;

const INLINE = {
  bold: { nodes: ["StrongEmphasis"], mark: "**" },
  italic: { nodes: ["Emphasis"], mark: "*" },
  strike: { nodes: ["Strikethrough"], mark: "~~" },
  code: { nodes: ["InlineCode"], mark: "`" },
} as const;

// The syntax nodes around `pos`, innermost first.
function* around(state: EditorState, pos: number, side: -1 | 1) {
  const tree = ensureSyntaxTree(state, pos, PARSE_MS);
  for (let node = tree ? tree.resolveInner(pos, side) : null; node; node = node.parent) yield node;
}

// The first syntax node of one of these kinds around `pos`, or null.
function enclosing(state: EditorState, pos: number, names: readonly string[], side: -1 | 1 = 1) {
  for (const node of around(state, pos, side)) if (names.includes(node.name)) return node;
  return null;
}

export const toggleInline =
  (kind: keyof typeof INLINE): StateCommand =>
  ({ state, dispatch }) => {
    const { nodes, mark } = INLINE[kind];
    const m = mark.length;
    dispatch(
      state.update(
        state.changeByRange((range) => {
          const node = enclosing(state, range.from, nodes);
          if (node && node.to >= range.to) {
            // Already marked: take the marks off, and keep the selection on the same text.
            const closing = node.to - m;
            const shift = (p: number) => p - Math.min(m, Math.max(0, p - node.from)) - Math.min(m, Math.max(0, p - closing));
            return {
              changes: [
                { from: node.from, to: node.from + m },
                { from: closing, to: node.to },
              ],
              range: EditorSelection.range(shift(range.anchor), shift(range.head)),
            };
          }
          return {
            changes: [
              { from: range.from, insert: mark },
              { from: range.to, insert: mark },
            ],
            range: EditorSelection.range(range.anchor + m, range.head + m),
          };
        }),
        { scrollIntoView: true, userEvent: "input.format" },
      ),
    );
    return true;
  };

// The lines the selection touches (not the line it only reaches the start of).
function selectedLines(state: EditorState) {
  const lines: { from: number; to: number; text: string; number: number }[] = [];
  for (const { from, to } of state.selection.ranges) {
    const last = state.doc.lineAt(to !== from && state.doc.lineAt(to).from === to ? to - 1 : to).number;
    for (let n = state.doc.lineAt(from).number; n <= last; n++) {
      if (!lines.some((l) => l.number === n)) lines.push(state.doc.line(n));
    }
  }
  return lines;
}

const HEADING = /^(#{1,6})[ \t]+/;

// Level 1 to 3 makes the lines headings (the same level again takes it off); 0 makes them plain text.
export const setHeading =
  (level: 0 | 1 | 2 | 3): StateCommand =>
  ({ state, dispatch }) => {
    const changes = selectedLines(state).map((line) => {
      const current = HEADING.exec(line.text);
      const remove = level === 0 || current?.[1].length === level;
      return { from: line.from, to: line.from + (current?.[0].length ?? 0), insert: remove ? "" : `${"#".repeat(level)} ` };
    });
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input.format" }));
    return true;
  };

const LINE_KINDS = {
  bullet: { own: /^[-*+][ \t]+(?!\[[ xX]\][ \t])/, prefix: () => "- " },
  numbered: { own: /^\d+[.)][ \t]+/, prefix: (i: number) => `${i + 1}. ` },
  task: { own: /^[-*+][ \t]+\[[ xX]\][ \t]+/, prefix: () => "- [ ] " },
  quote: { own: /^>[ \t]?/, prefix: () => "> " },
} as const;

// Any of the above, so changing a bullet to a numbered list replaces the mark instead of stacking another.
const ANY_PREFIX = /^(?:[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+|>[ \t]?)/;

export const toggleLinePrefix =
  (kind: keyof typeof LINE_KINDS): StateCommand =>
  ({ state, dispatch }) => {
    const { own, prefix } = LINE_KINDS[kind];
    const all = selectedLines(state);
    // Blank lines between items are left alone, unless the selection is only a blank line.
    const lines = all.length > 1 ? all.filter((l) => l.text.trim() !== "") : all;
    const off = lines.every((l) => own.test(l.text));
    const changes = lines.map((line, i) => {
      const current = off ? own.exec(line.text) : ANY_PREFIX.exec(line.text);
      return { from: line.from, to: line.from + (current?.[0].length ?? 0), insert: off ? "" : prefix(i) };
    });
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input.format" }));
    return true;
  };

export const toggleCodeBlock: StateCommand = ({ state, dispatch }) => {
  const fenced = enclosing(state, state.selection.main.head, ["FencedCode"], -1);
  if (fenced) {
    const first = state.doc.lineAt(fenced.from);
    const last = state.doc.lineAt(fenced.to);
    dispatch(
      state.update({
        changes: [
          { from: first.from, to: Math.min(first.to + 1, state.doc.length) },
          ...(last.number > first.number ? [{ from: last.from - 1, to: last.to }] : []),
        ],
        userEvent: "input.format",
      }),
    );
    return true;
  }
  const lines = selectedLines(state);
  const from = lines[0].from;
  const to = lines[lines.length - 1].to;
  dispatch(
    state.update({
      changes: [
        { from, insert: "```\n" },
        { from: to, insert: "\n```" },
      ],
      selection: from === to ? EditorSelection.cursor(from + 4) : undefined,
      scrollIntoView: true,
      userEvent: "input.format",
    }),
  );
  return true;
};

// [text](url), with the url selected ready to type over; or the selected words as the link text.
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const { from, to } = state.selection.main;
  if (from === to) {
    dispatch(
      state.update({
        changes: { from, insert: "[text](url)" },
        selection: EditorSelection.range(from + 1, from + 5),
        scrollIntoView: true,
        userEvent: "input.format",
      }),
    );
  } else {
    dispatch(
      state.update({
        changes: [
          { from, insert: "[" },
          { from: to, insert: "](url)" },
        ],
        selection: EditorSelection.range(to + 3, to + 6),
        scrollIntoView: true,
        userEvent: "input.format",
      }),
    );
  }
  return true;
};

// [[ ]] around the selection, or with the caret between; the caller opens the suggestions.
export const insertWikilink: StateCommand = ({ state, dispatch }) => {
  const { from, to } = state.selection.main;
  dispatch(
    state.update({
      changes: [
        { from, insert: "[[" },
        { from: to, insert: "]]" },
      ],
      selection: EditorSelection.range(from + 2, to + 2),
      scrollIntoView: true,
      userEvent: "input.format",
    }),
  );
  return true;
};

// A block (a table, a rule) goes after the current line, with a blank line before it so that a rule does not turn the
// line above into a heading.
function insertBlock(block: string): StateCommand {
  return ({ state, dispatch }) => {
    const line = state.doc.lineAt(state.selection.main.head);
    const insert = (line.text.trim() ? "\n\n" : "") + block;
    dispatch(
      state.update({
        changes: { from: line.to, insert },
        selection: EditorSelection.cursor(line.to + insert.length),
        scrollIntoView: true,
        userEvent: "input.format",
      }),
    );
    return true;
  };
}

export const insertTable = insertBlock("| Column | Column |\n| --- | --- |\n|  |  |\n");
export const insertDivider = insertBlock("---\n");

const ACTIVE: Record<string, string> = {
  StrongEmphasis: "bold",
  Emphasis: "italic",
  Strikethrough: "strike",
  InlineCode: "code",
  Link: "link",
  FencedCode: "codeBlock",
  OrderedList: "numbered",
  Blockquote: "quote",
  Task: "task",
  ATXHeading1: "heading1",
  ATXHeading2: "heading2",
  ATXHeading3: "heading3",
};

// What the caret is inside, for the toolbar's pressed buttons. A task item is a task, not also a bullet.
export function activeFormats(state: EditorState): Set<string> {
  const active = new Set<string>();
  const pos = state.selection.main.head;
  let bullet = false;
  for (const node of around(state, pos, -1)) {
    if (node.name === "BulletList") bullet = true;
    else if (ACTIVE[node.name]) active.add(ACTIVE[node.name]);
  }
  if (bullet && !active.has("task")) active.add("bullet");
  return active;
}
