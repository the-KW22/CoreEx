import { type Extension, StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

import type { Marks } from "./proposal-marks";

// A Proposal drawn on the Note's own text (docs/DESIGN.md section 6.14): removed lines struck out, added lines shown
// in place after the line they follow. Nothing is written into the document, so the User's text is never touched.
// Plain text only: the model's words are never turned into HTML.
export const showProposal = StateEffect.define<Marks | null>();
// The part a just-accepted change put in, marked for a moment.
export const flashRange = StateEffect.define<{ from: number; to: number } | null>();

class AddedLines extends WidgetType {
  constructor(readonly lines: string[]) {
    super();
  }

  eq(other: AddedLines) {
    return other.lines.join("\n") === this.lines.join("\n");
  }

  toDOM() {
    const box = document.createElement("div");
    box.className = "cm-proposal-add";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Added by the proposal");
    for (const line of this.lines) {
      const row = document.createElement("div");
      row.textContent = line || " ";
      box.append(row);
    }
    return box;
  }
}

const strike = Decoration.line({ class: "cm-proposal-del", attributes: { "data-proposal": "removed" } });

// Said before a removed line, for screen readers: the strike-through alone is not heard.
class RemovedWord extends WidgetType {
  toDOM() {
    const word = document.createElement("span");
    word.className = "sr-only";
    word.textContent = "removed: ";
    return word;
  }
}

function build(doc: Text, marks: Marks): DecorationSet {
  const ranges = [];
  for (const n of marks.deleted) {
    if (n >= doc.lines) continue;
    const from = doc.line(n + 1).from;
    ranges.push(strike.range(from), Decoration.widget({ widget: new RemovedWord(), side: -1 }).range(from));
  }
  for (const group of marks.added) {
    const pos = group.after < 0 ? 0 : doc.line(Math.min(group.after + 1, doc.lines)).to;
    ranges.push(Decoration.widget({ widget: new AddedLines(group.lines), block: true, side: group.after < 0 ? -1 : 1 }).range(pos));
  }
  // Sorted by the library, which knows the order line, inline and block marks must come in.
  return Decoration.set(ranges, true);
}

const proposalField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(showProposal)) return e.value ? build(tr.state.doc, e.value) : Decoration.none;
    // Any typing, or any other change to the text, ends the preview: the User's text always wins.
    return tr.docChanged ? Decoration.none : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const flashMark = Decoration.mark({ class: "cm-proposal-new" });

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(flashRange)) {
        const range = e.value;
        value = range && range.to > range.from ? Decoration.set([flashMark.range(Math.min(range.from, tr.state.doc.length), Math.min(range.to, tr.state.doc.length))]) : Decoration.none;
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const proposalView: Extension = [proposalField, flashField];
