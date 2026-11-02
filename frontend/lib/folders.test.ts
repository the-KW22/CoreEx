import { describe, expect, it } from "vitest";

import { ancestorIds, graphFolderChoices, type Folder, viewingFolderId } from "./folders";

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

describe("viewingFolderId", () => {
  it("is the id on a Folder page, and on nothing below it", () => {
    expect(viewingFolderId("/folders/abc")).toBe("abc");
    expect(viewingFolderId("/folders/abc/")).toBe("abc");
  });

  it("is undefined everywhere else", () => {
    for (const path of ["/", "/folders", "/notes/abc", "/tags/abc", "/foldersx/abc"]) {
      expect(viewingFolderId(path)).toBeUndefined();
    }
  });
});

describe("graphFolderChoices", () => {
  const all = [folder("a", null), folder("b", "a"), folder("c", null)];
  it("lists top-level Folders only", () => {
    expect(graphFolderChoices(all, null).map((f) => f.id)).toEqual(["a", "c"]);
    expect(graphFolderChoices(all, "a").map((f) => f.id)).toEqual(["a", "c"]);
  });
  it("adds a subfolder that is open, as a flat choice", () => {
    const choices = graphFolderChoices(all, "b");
    expect(choices.map((f) => f.id)).toEqual(["a", "c", "b"]);
    expect(choices[2].parentId).toBeNull();
  });
});
