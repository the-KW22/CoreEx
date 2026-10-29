import { describe, expect, it } from "vitest";

import { pageInfo } from "./pages";

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
