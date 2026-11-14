import { describe, expect, it } from "vitest";

import {
  clearAllUnsaved,
  clearUnsaved,
  recoveryAction,
  storeUnsaved,
  takeNewestUnsaved,
  type Store,
} from "./recovery";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

// A browser's localStorage, as far as the recovery code uses it.
function fakeStore(): Store & { keys: () => string[] } {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

const entry = (body: string, storedAt = NOW, version = 3) => ({ title: "Plans", body, version, storedAt });

describe("storeUnsaved and takeNewestUnsaved", () => {
  it("gives back what was stored, and removes it", () => {
    const store = fakeStore();
    storeUnsaved("n1", "tab-a", entry("typed"), store);

    expect(takeNewestUnsaved("n1", NOW + 1000, store)).toEqual(entry("typed"));
    expect(store.keys()).toEqual([]);
  });

  it("takes the newest of several tabs and removes the older ones", () => {
    const store = fakeStore();
    storeUnsaved("n1", "tab-a", entry("older", NOW - 5000), store);
    storeUnsaved("n1", "tab-b", entry("newest", NOW), store);

    expect(takeNewestUnsaved("n1", NOW + 1000, store)?.body).toBe("newest");
    expect(store.keys()).toEqual([]);
  });

  it("drops entries older than seven days", () => {
    const store = fakeStore();
    storeUnsaved("n1", "tab-a", entry("stale", NOW - 8 * DAY), store);

    expect(takeNewestUnsaved("n1", NOW, store)).toBeNull();
    expect(store.keys()).toEqual([]);
  });

  it("leaves the entries of other Notes alone", () => {
    const store = fakeStore();
    storeUnsaved("n2", "tab-a", entry("other note"), store);

    expect(takeNewestUnsaved("n1", NOW, store)).toBeNull();
    expect(store.keys()).toHaveLength(1);
  });

  it("ignores an entry that is not ours or is damaged", () => {
    const store = fakeStore();
    store.setItem("coreex:unsaved:n1:tab-a", "not json");
    store.setItem("coreex:unsaved:n1:tab-b", JSON.stringify({ body: 5 }));

    expect(takeNewestUnsaved("n1", NOW, store)).toBeNull();
  });
});

describe("clearUnsaved", () => {
  it("removes this tab's entry and leaves another tab's", () => {
    const store = fakeStore();
    storeUnsaved("n1", "tab-a", entry("a"), store);
    storeUnsaved("n1", "tab-b", entry("b"), store);

    clearUnsaved("n1", "tab-a", store);

    expect(store.keys()).toEqual(["coreex:unsaved:n1:tab-b"]);
  });
});

describe("clearAllUnsaved", () => {
  it("removes every recovery entry and nothing else", () => {
    const store = fakeStore();
    storeUnsaved("n1", "tab-a", entry("a"), store);
    storeUnsaved("n2", "tab-b", entry("b"), store);
    store.setItem("theme", "dark");

    clearAllUnsaved(store);

    expect(store.keys()).toEqual(["theme"]);
  });
});

describe("a store that is not there or that throws", () => {
  const broken: Store = {
    length: 1,
    key: () => {
      throw new Error("blocked");
    },
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };

  it("never throws, and finds nothing", () => {
    expect(() => storeUnsaved("n1", "tab-a", entry("x"), broken)).not.toThrow();
    expect(() => clearUnsaved("n1", "tab-a", broken)).not.toThrow();
    expect(() => clearAllUnsaved(broken)).not.toThrow();
    expect(takeNewestUnsaved("n1", NOW, broken)).toBeNull();
    expect(takeNewestUnsaved("n1", NOW, null)).toBeNull();
  });
});

describe("recoveryAction", () => {
  const stored = { title: "Plans", body: "saved", version: 3 };

  it("has nothing to do when the entry is the stored text", () => {
    expect(recoveryAction(entry("saved"), stored)).toBe("none");
  });

  it("restores different text typed on the stored version", () => {
    expect(recoveryAction(entry("typed more"), stored)).toBe("restore");
  });

  it("starts in conflict when the Note has moved on since", () => {
    expect(recoveryAction(entry("typed more", NOW, 2), stored)).toBe("conflict");
  });

  it("restores a changed title alone", () => {
    expect(recoveryAction({ ...entry("saved"), title: "Renamed" }, stored)).toBe("restore");
  });
});
