import { describe, expect, it } from "vitest";

import { smallestEdit } from "./edit";

const apply = (before: string, after: string) => {
  const edit = smallestEdit(before, after);
  return before.slice(0, edit.from) + edit.insert + before.slice(edit.to);
};

describe("smallestEdit", () => {
  it("changes only the middle", () => {
    expect(smallestEdit("hello world", "hello brave world")).toEqual({ from: 6, to: 6, insert: "brave " });
  });

  it("is empty when nothing changed", () => {
    const edit = smallestEdit("same", "same");
    expect(edit.insert).toBe("");
    expect(edit.from).toBe(edit.to);
  });

  it("turns before into after, however they differ", () => {
    for (const [before, after] of [["", "abc"], ["abc", ""], ["aaa", "aa"], ["abcabc", "abc"], ["x[[1]]y", "x[[2]]y"]]) {
      expect(apply(before, after)).toBe(after);
    }
  });
});
