import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  activeFormats,
  insertDivider,
  insertLink,
  setHeading,
  toggleCodeBlock,
  toggleInline,
  toggleLinePrefix,
} from "./format";

const stateOf = (doc: string, from: number, to = from) =>
  EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: [markdown({ base: markdownLanguage })],
  });

// Runs one command on a document with the selection from..to; gives back the text and the selected part.
function run(command: StateCommand, doc: string, from: number, to = from) {
  let state = stateOf(doc, from, to);
  command({ state, dispatch: (tr) => (state = tr.state) });
  const { from: a, to: b } = state.selection.main;
  return { doc: state.doc.toString(), selected: state.sliceDoc(a, b), at: a };
}

describe("inline formats", () => {
  it("wrap the selection and keep it selected", () => {
    expect(run(toggleInline("bold"), "hello", 0, 5)).toMatchObject({ doc: "**hello**", selected: "hello" });
  });

  it("take the marks off again, from the caret inside or the whole selection", () => {
    expect(run(toggleInline("bold"), "**hello**", 4).doc).toBe("hello");
    expect(run(toggleInline("bold"), "**hello**", 2, 7)).toMatchObject({ doc: "hello", selected: "hello" });
  });

  it("with nothing selected put the caret between the marks", () => {
    expect(run(toggleInline("italic"), "", 0)).toMatchObject({ doc: "**", at: 1 });
    expect(run(toggleInline("code"), "a ", 2)).toMatchObject({ doc: "a ``", at: 3 });
  });

  it("leave other formats alone", () => {
    expect(run(toggleInline("italic"), "**hi**", 2, 3).doc).toBe("***h*i**");
  });
});

describe("headings", () => {
  it("set a level, switch level, and toggle off on the same level", () => {
    expect(run(setHeading(2), "text", 0).doc).toBe("## text");
    expect(run(setHeading(1), "## text", 3).doc).toBe("# text");
    expect(run(setHeading(2), "## text", 3).doc).toBe("text");
    expect(run(setHeading(0), "### text", 4).doc).toBe("text");
  });
});

describe("line formats", () => {
  it("make every selected line a list item, and take it off again", () => {
    expect(run(toggleLinePrefix("bullet"), "a\nb", 0, 3).doc).toBe("- a\n- b");
    expect(run(toggleLinePrefix("bullet"), "- a\n- b", 0, 7).doc).toBe("a\nb");
  });

  it("number the lines", () => {
    expect(run(toggleLinePrefix("numbered"), "a\nb", 0, 3).doc).toBe("1. a\n2. b");
  });

  it("make tasks and quotes", () => {
    expect(run(toggleLinePrefix("task"), "a", 0).doc).toBe("- [ ] a");
    expect(run(toggleLinePrefix("quote"), "a", 0).doc).toBe("> a");
  });

  it("replace the mark when the list kind changes instead of stacking another", () => {
    expect(run(toggleLinePrefix("numbered"), "- a", 0).doc).toBe("1. a");
    expect(run(toggleLinePrefix("bullet"), "- [ ] a", 0).doc).toBe("- a");
  });

  it("skip the blank line between items", () => {
    expect(run(toggleLinePrefix("bullet"), "a\n\nb", 0, 4).doc).toBe("- a\n\n- b");
  });
});

describe("blocks and links", () => {
  it("fence a code block and unfence it again", () => {
    expect(run(toggleCodeBlock, "a", 0).doc).toBe("```\na\n```");
    expect(run(toggleCodeBlock, "```\na\n```", 5).doc).toBe("a");
  });

  it("make a link with the url ready to type over", () => {
    expect(run(insertLink, "site", 0, 4)).toMatchObject({ doc: "[site](url)", selected: "url" });
    expect(run(insertLink, "", 0)).toMatchObject({ doc: "[text](url)", selected: "text" });
  });

  it("put a rule after a blank line, so it is not a heading underline", () => {
    expect(run(insertDivider, "para", 4).doc).toBe("para\n\n---\n");
  });
});

describe("activeFormats", () => {
  it("tells what the caret is inside", () => {
    expect(activeFormats(stateOf("**hi**", 4))).toContain("bold");
    expect(activeFormats(stateOf("# Title", 4))).toContain("heading1");
    expect(activeFormats(stateOf("> quote", 4))).toContain("quote");
    expect(activeFormats(stateOf("plain", 2)).size).toBe(0);
  });

  it("counts a task item as a task and not as a bullet", () => {
    const task = activeFormats(stateOf("- [ ] x", 7));
    expect(task).toContain("task");
    expect(task).not.toContain("bullet");
    expect(activeFormats(stateOf("- x", 3))).toContain("bullet");
  });
});
