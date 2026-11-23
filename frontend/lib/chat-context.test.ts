import { beforeEach, describe, expect, it, vi } from "vitest";

import { askChat, chatContext, clearTrail, MAX_SELECTION, MAX_TITLE, MAX_TRAIL, recordAction, setOpenItem, setSelection, takePrepared, trailEntries } from "./chat-context";

beforeEach(() => {
  clearTrail();
  setOpenItem(null);
});

describe("the session trail", () => {
  it("keeps only the last 20 actions, newest last", () => {
    for (let i = 0; i < 25; i++) recordAction({ action: "OPENED", kind: "NOTE", id: `id-${i}`, title: `Note ${i}` });
    const trail = trailEntries();
    expect(trail).toHaveLength(MAX_TRAIL);
    expect(trail[0].id).toBe("id-5");
    expect(trail.at(-1)?.id).toBe("id-24");
  });

  it("turns a repeat of the same action on the same Item into one entry with the newest title", () => {
    recordAction({ action: "EDITED", kind: "NOTE", id: "a", title: "Old" });
    recordAction({ action: "EDITED", kind: "NOTE", id: "a", title: "New" });
    expect(trailEntries()).toEqual([{ action: "EDITED", kind: "NOTE", id: "a", title: "New" }]);
  });

  it("keeps two different actions, and a different Item", () => {
    recordAction({ action: "OPENED", kind: "NOTE", id: "a", title: "A" });
    recordAction({ action: "EDITED", kind: "NOTE", id: "a", title: "A" });
    recordAction({ action: "EDITED", kind: "NOTE", id: "b", title: "B" });
    expect(trailEntries()).toHaveLength(3);
  });

  it("counts two searches for different words as two entries, the same words as one", () => {
    recordAction({ action: "SEARCHED", kind: "SEARCH", title: "tax" });
    recordAction({ action: "SEARCHED", kind: "SEARCH", title: "tax" });
    recordAction({ action: "SEARCHED", kind: "SEARCH", title: "visa" });
    expect(trailEntries().map((e) => e.title)).toEqual(["tax", "visa"]);
  });

  it("cuts a long title to what the API accepts", () => {
    recordAction({ action: "OPENED", kind: "NOTE", id: "a", title: "x".repeat(MAX_TITLE + 50) });
    expect(trailEntries()[0].title).toHaveLength(MAX_TITLE);
  });
});

describe("the context sent with a message", () => {
  it("is nothing at all when nothing is open and nothing was done", () => {
    expect(chatContext()).toBeUndefined();
  });

  it("holds the open Item, the selection and the trail", () => {
    setOpenItem({ kind: "NOTE", id: "n1", title: "Plan" });
    setSelection("a chosen line");
    recordAction({ action: "OPENED", kind: "NOTE", id: "n1", title: "Plan" });
    expect(chatContext()).toEqual({
      open: { kind: "NOTE", id: "n1", title: "Plan" },
      selection: "a chosen line",
      trail: [{ action: "OPENED", kind: "NOTE", id: "n1", title: "Plan" }],
    });
  });

  it("drops a selection when no Item is open, and cuts a long one", () => {
    setSelection("orphan");
    expect(chatContext()).toBeUndefined();
    setOpenItem({ kind: "NOTE", id: "n1", title: "Plan" });
    setSelection("y".repeat(MAX_SELECTION + 10));
    expect(chatContext()?.selection).toHaveLength(MAX_SELECTION);
  });

  it("forgets the selection when the Item is closed", () => {
    setOpenItem({ kind: "NOTE", id: "n1", title: "Plan" });
    setSelection("text");
    setOpenItem(null);
    setOpenItem({ kind: "NOTE", id: "n2", title: "Other" });
    expect(chatContext()?.selection).toBeUndefined();
  });
});

describe("a prepared message", () => {
  it("is taken once", () => {
    vi.stubGlobal("window", { dispatchEvent: () => true });
    askChat("About my Note");
    expect(takePrepared()).toBe("About my Note");
    expect(takePrepared()).toBeNull();
  });
});
