import { describe, expect, it } from "vitest";

import { pageInfo, pageRange } from "./pages";

describe("pageInfo", () => {
  it("counts pages, the last one partly full", () => {
    expect(pageInfo(101, "0", 50)).toEqual({ page: 0, pages: 3, prev: null, next: 1 });
    expect(pageInfo(101, "2", 50)).toEqual({ page: 2, pages: 3, prev: 1, next: null });
  });

  it("has one page when there is nothing, so the empty list still has a page", () => {
    expect(pageInfo(0, undefined, 50)).toEqual({ page: 0, pages: 1, prev: null, next: null });
  });

  it("treats a missing, broken or negative page as the first", () => {
    for (const raw of [undefined, "", "abc", "-3", ["1", "2"]]) {
      expect(pageInfo(120, raw, 50).page).toBe(0);
    }
  });

  it("keeps a page past the end, so the list can say it is empty rather than jump", () => {
    expect(pageInfo(10, "7", 50)).toEqual({ page: 7, pages: 1, prev: 6, next: null });
  });
});

describe("pageRange", () => {
  it("lists every page when there are few", () => {
    expect(pageRange(0, 1)).toEqual([0]);
    expect(pageRange(2, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageRange(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("keeps the first, the last and the current page with one on each side, and an ellipsis for each gap", () => {
    expect(pageRange(5, 20)).toEqual([0, "...", 4, 5, 6, "...", 19]);
  });

  it("never shows an ellipsis for a single hidden page, so the row is always 7 wide", () => {
    expect(pageRange(0, 20)).toEqual([0, 1, 2, 3, 4, "...", 19]);
    expect(pageRange(3, 20)).toEqual([0, 1, 2, 3, 4, "...", 19]);
    expect(pageRange(16, 20)).toEqual([0, "...", 15, 16, 17, 18, 19]);
    expect(pageRange(19, 20)).toEqual([0, "...", 15, 16, 17, 18, 19]);
  });

  it("treats a page past the end as the last", () => {
    expect(pageRange(40, 20)).toEqual([0, "...", 15, 16, 17, 18, 19]);
  });
});
