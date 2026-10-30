import { describe, expect, it } from "vitest";

import { storageSegments } from "./storage";

const user = (email: string, storageUsedBytes: number) => ({ email, storageUsedBytes });

describe("storageSegments", () => {
  it("has no segments when nothing is stored", () => {
    expect(storageSegments([user("a@x.io", 0)], 0)).toEqual([]);
  });

  it("lists Users biggest first and leaves out an Others segment when they add up to the total", () => {
    const segments = storageSegments([user("small@x.io", 10), user("big@x.io", 90)], 100);
    expect(segments.map((s) => s.label)).toEqual(["big@x.io", "small@x.io"]);
  });

  it("counts storage not accounted for by the listed Users as Others", () => {
    const segments = storageSegments([user("a@x.io", 40)], 100);
    expect(segments.at(-1)).toMatchObject({ label: "Others", bytes: 60 });
  });

  it("folds Users past the colours into Others, keeping the total", () => {
    const users = Array.from({ length: 12 }, (_, i) => user(`u${i}@x.io`, 10 + i));
    const segments = storageSegments(users, users.reduce((sum, u) => sum + u.storageUsedBytes, 0));
    expect(segments).toHaveLength(8);
    expect(segments.at(-1)?.label).toBe("Others");
    expect(segments.reduce((sum, s) => sum + s.bytes, 0)).toBe(users.reduce((sum, u) => sum + u.storageUsedBytes, 0));
  });
});
