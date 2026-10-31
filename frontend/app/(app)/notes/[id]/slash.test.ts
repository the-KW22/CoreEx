import { CompletionContext, type Completion } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, Transaction, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { slashCompletion } from "./slash";

const stateOf = (doc: string, at = doc.length) =>
  EditorState.create({ doc, selection: EditorSelection.cursor(at), extensions: [markdown({ base: markdownLanguage })] });

// What the menu offers with the caret at the end of `doc`.
function offered(doc: string, at = doc.length) {
  const state = stateOf(doc, at);
  return slashCompletion(new CompletionContext(state, at, false)) as ReturnType<typeof slashCompletion> & {
    from: number;
    options: Completion[];
  };
}

// Picks an option the way the editor does, on a stand-in for the view.
function pick(doc: string, label: string) {
  const result = offered(doc)!;
  const view = {
    state: stateOf(doc),
    dispatch(spec: Transaction | TransactionSpec) {
      this.state = (spec instanceof Transaction ? spec : this.state.update(spec)).state;
    },
  };
  const option = result.options.find((o) => o.label === label)!;
  (option.apply as (v: typeof view, c: Completion, from: number, to: number) => void)(view, option, result.from, doc.length);
  return view.state.doc.toString();
}

describe("slash menu", () => {
  it("opens at the start of a line and after a space, from just after the slash", () => {
    expect(offered("/")?.from).toBe(1);
    expect(offered("intro\n/he")?.from).toBe(7);
    expect(offered("some text /")?.from).toBe(11);
    expect(offered("/")?.options.map((o) => o.label)).toContain("Heading 1");
  });

  it("stays shut for a slash in a word, a URL or code", () => {
    expect(offered("and/or")).toBeNull();
    expect(offered("see https://example.com/pa")).toBeNull();
    expect(offered("```\n/he")).toBeNull();
    expect(offered("`code /he`", 9)).toBeNull();
    expect(offered("no slash")).toBeNull();
  });

  it("replaces the slash and what followed it with the block", () => {
    expect(pick("intro\n/head", "Heading 2")).toBe("intro\n## ");
    expect(pick("/bul", "Bulleted list")).toBe("- ");
    expect(pick("/chec", "Checklist")).toBe("- [ ] ");
    expect(pick("/div", "Divider")).toBe("---\n");
    expect(pick("text /q", "Quote")).toBe("> text ");
  });
});
