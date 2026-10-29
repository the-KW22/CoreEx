import { describe, expect, it } from "vitest";

import { ancestorIds, type Folder } from "./folders";

const folder = (id: string, parentId: string | null): Folder => ({ id, parentId, name: id }) as Folder;

describe("ancestorIds", () => {
  const tree = [folder("a", null), folder("b", "a"), folder("c", "b"), folder("x", null)];

  it("lists the parents from the nearest up to the top level", () => {
    expect(ancestorIds(tree, "c")).toEqual(["b", "a"]);
  });

  it("is empty for a top-level or unknown Folder", () => {
    expect(ancestorIds(tree, "a")).toEqual([]);
    expect(ancestorIds(tree, "nope")).toEqual([]);
  });

  it("stops if bad data made the parents loop", () => {
    const loop = [folder("a", "b"), folder("b", "a")];
    expect(ancestorIds(loop, "a").length).toBeLessThanOrEqual(2);
  });
});
