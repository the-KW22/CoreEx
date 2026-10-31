import { type Completion, type CompletionSource, startCompletion } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { StateCommand } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import {
  insertDivider,
  insertTable,
  insertWikilink,
  setHeading,
  toggleCodeBlock,
  toggleLinePrefix,
} from "./format";

// The blocks the slash menu offers: the toolbar's commands, run on the line the "/text" was typed on.
const BLOCKS: { label: string; command: StateCommand; wikilink?: boolean }[] = [
  { label: "Heading 1", command: setHeading(1) },
  { label: "Heading 2", command: setHeading(2) },
  { label: "Heading 3", command: setHeading(3) },
  { label: "Bulleted list", command: toggleLinePrefix("bullet") },
  { label: "Numbered list", command: toggleLinePrefix("numbered") },
  { label: "Checklist", command: toggleLinePrefix("task") },
  { label: "Quote", command: toggleLinePrefix("quote") },
  { label: "Code block", command: toggleCodeBlock },
  { label: "Link to a Note or Asset", command: insertWikilink, wikilink: true },
  { label: "Table", command: insertTable },
  { label: "Divider", command: insertDivider },
];

const CODE = ["FencedCode", "CodeBlock", "InlineCode"];

const options: Completion[] = BLOCKS.map(({ label, command, wikilink }) => ({
  label,
  type: "keyword",
  // `from` is just after the "/", so the "/" and what was typed after it go, then the block is made.
  apply: (view: Pick<EditorView, "state" | "dispatch">, _completion: Completion, from: number, to: number) => {
    view.dispatch({ changes: { from: from - 1, to }, selection: { anchor: from - 1 } });
    command({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
    // The [[ ]] it adds is empty: open the Link suggestions inside it, as the toolbar button does.
    if (wikilink) startCompletion(view as EditorView);
  },
}));

// "/" at the start of a line or after a space opens the menu; typing after it filters. A "/" in a word or a URL, or in
// code, is just a slash.
export const slashCompletion: CompletionSource = (context) => {
  const match = context.matchBefore(/\/\w*$/);
  if (!match) return null;
  if (match.from > 0 && !/\s/.test(context.state.sliceDoc(match.from - 1, match.from))) return null;
  for (let node = syntaxTree(context.state).resolveInner(match.from, -1); node; node = node.parent!) {
    if (CODE.includes(node.name)) return null;
    if (!node.parent) break;
  }
  return { from: match.from + 1, options, validFor: /^\w*$/ };
};
