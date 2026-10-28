import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// Live preview: the Markdown stays plain text, but headings, emphasis, bullets, checkboxes and code look
// rendered. The markup itself shows only on the line the cursor is on.

class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.textContent = "•";
    bullet.className = "cm-bullet";
    return bullet;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.addEventListener("mousedown", (event) => event.preventDefault());
    box.addEventListener("click", () => {
      // The widget stands for "[ ]" or "[x]"; flip the middle character in the text.
      const from = view.posAtDOM(box);
      const marker = view.state.doc.sliceString(from, from + 3);
      if (marker !== "[ ]" && marker.toLowerCase() !== "[x]") return;
      view.dispatch({ changes: { from: from + 1, to: from + 2, insert: marker[1] === " " ? "x" : " " } });
    });
    return box;
  }

  // The checkbox handles its own clicks.
  ignoreEvent() {
    return true;
  }
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const checkboxes = [new CheckboxWidget(false), new CheckboxWidget(true)];
const inline = {
  StrongEmphasis: Decoration.mark({ class: "cm-strong" }),
  Emphasis: Decoration.mark({ class: "cm-em" }),
  Strikethrough: Decoration.mark({ class: "cm-strike" }),
  InlineCode: Decoration.mark({ class: "cm-code" }),
} as const;
const codeLine = Decoration.line({ class: "cm-codeblock" });

function build(view: EditorView): DecorationSet {
  const { doc, selection } = view.state;
  const cursorLines = new Set<number>();
  for (const range of selection.ranges) {
    for (let n = doc.lineAt(range.from).number; n <= doc.lineAt(range.to).number; n++) cursorLines.add(n);
  }

  const out: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const line = doc.lineAt(node.from);
        const quiet = !cursorLines.has(line.number);
        const heading = /^ATXHeading([1-6])$/.exec(node.name);
        if (heading) {
          out.push(Decoration.line({ class: `cm-h${heading[1]}` }).range(line.from));
        } else if (node.name in inline) {
          out.push(inline[node.name as keyof typeof inline].range(node.from, node.to));
        } else if (node.name === "FencedCode" || node.name === "CodeBlock") {
          for (let n = line.number; n <= doc.lineAt(node.to).number; n++) out.push(codeLine.range(doc.line(n).from));
        } else if (quiet && node.name === "HeaderMark") {
          // "# " hides together with the space after it.
          out.push(hidden.range(node.from, Math.min(node.to + 1, line.to)));
        } else if (quiet && (node.name === "EmphasisMark" || node.name === "StrikethroughMark")) {
          out.push(hidden.range(node.from, node.to));
        } else if (quiet && node.name === "CodeMark" && node.node.parent?.name === "InlineCode") {
          out.push(hidden.range(node.from, node.to));
        } else if (quiet && node.name === "ListMark" && node.node.parent?.parent?.name === "BulletList") {
          // Before a checkbox the bullet disappears entirely.
          const task = node.node.nextSibling?.name === "Task";
          out.push(task ? hidden.range(node.from, Math.min(node.to + 1, line.to)) : bullet.range(node.from, node.to));
        } else if (quiet && node.name === "TaskMarker") {
          const checked = doc.sliceString(node.from, node.to).toLowerCase() === "[x]";
          out.push(Decoration.replace({ widget: checkboxes[checked ? 1 : 0] }).range(node.from, node.to));
        }
      },
    });
  }
  return Decoration.set(out, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = build(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
