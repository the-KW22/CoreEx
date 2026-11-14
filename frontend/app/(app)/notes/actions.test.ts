import { beforeEach, describe, expect, it, vi } from "vitest";

const api = { GET: vi.fn(), POST: vi.fn() };
vi.mock("@/lib/api/server", () => ({ getApi: async () => api }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../items/actions", () => ({ trashItem: vi.fn() }));

import { createNote, importNotes, keepCopyAndLoad } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const theirs = { id: "n1", title: "Plans", body: "theirs", version: 4, updatedAt: "2026-11-14T00:00:00Z", editedBy: "agent", folderId: "f1" };
const mine = { title: "Plans (mine)", body: "# Plans (mine)\nmy words" };

beforeEach(() => {
  api.GET.mockReset().mockImplementation(async (path: string) =>
    path === "/api/notes/{id}" ? { data: theirs } : { data: { items: [{ name: "physics" }, { name: "draft" }] } },
  );
  api.POST.mockReset().mockImplementation(async (path: string) =>
    path === "/api/notes" ? { data: { id: "copy1", title: mine.title } } : { data: { id: "tag" } },
  );
});

describe("keepCopyAndLoad", () => {
  it("keeps the text in a Note in the same Folder with the same Tags, then returns the stored Note", async () => {
    const result = await keepCopyAndLoad("n1", mine);

    expect(result).toEqual({ status: "loaded", note: theirs, copy: { id: "copy1", title: mine.title }, tagsCopied: true });
    expect(api.POST).toHaveBeenCalledWith("/api/notes", { body: { ...mine, folderId: "f1" } });
    expect(api.POST).toHaveBeenCalledWith("/api/items/{id}/tags", { params: { path: { id: "copy1" } }, body: { name: "physics" } });
    expect(api.POST).toHaveBeenCalledWith("/api/items/{id}/tags", { params: { path: { id: "copy1" } }, body: { name: "draft" } });
  });

  it("loads nothing when the copy cannot be made", async () => {
    api.POST.mockImplementation(async () => ({ error: { message: "Too long." } }));

    const result = await keepCopyAndLoad("n1", mine);

    expect(result).toEqual({ status: "error", message: "Too long." });
  });

  it("loads nothing when the copy request does not reach the API", async () => {
    api.POST.mockImplementation(async () => {
      throw new Error("network");
    });

    expect((await keepCopyAndLoad("n1", mine)).status).toBe("error");
  });

  it("makes no copy when the stored Note cannot be read", async () => {
    api.GET.mockImplementation(async () => ({ error: { message: "gone" } }));

    expect((await keepCopyAndLoad("n1", mine)).status).toBe("error");
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("still loads when a Tag cannot be put on the copy, and says the Tags were not all copied", async () => {
    api.POST.mockImplementation(async (path: string) =>
      path === "/api/notes" ? { data: { id: "copy1", title: mine.title } } : { error: { message: "no" } },
    );

    const result = await keepCopyAndLoad("n1", mine);

    expect(result).toMatchObject({ status: "loaded", tagsCopied: false });
  });
});

describe("ids that let the API tell a repeat from a new Note", () => {
  it("createNote sends a fresh id with every click", async () => {
    api.POST.mockImplementation(async () => ({ data: { id: "n1" } }));

    await createNote(new FormData());
    await createNote(new FormData());

    const ids = api.POST.mock.calls.map(([, init]) => init.body.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(UUID);
    expect(ids[1]).toMatch(UUID);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("importNotes sends one id per file, in order", async () => {
    api.POST.mockImplementation(async () => ({ data: { results: [] } }));
    const form = new FormData();
    form.append("files", new File(["a"], "a.md"));
    form.append("files", new File(["b"], "b.md"));

    await importNotes(form);

    const { ids } = api.POST.mock.calls[0][1].params.query;
    expect(ids).toHaveLength(2);
    expect(ids.every((id: string) => UUID.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });
});
