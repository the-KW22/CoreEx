import { describe, expect, it } from "vitest";

import { relativeTime } from "./time";

const now = Date.parse("2026-10-29T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says just now for the last minute, and for a clock slightly ahead", () => {
    expect(relativeTime(ago(20_000), now)).toBe("just now");
    expect(relativeTime(ago(-5_000), now)).toBe("just now");
  });

  it("uses the largest whole unit", () => {
    expect(relativeTime(ago(5 * MIN), now)).toBe("5 minutes ago");
    expect(relativeTime(ago(HOUR), now)).toBe("1 hour ago");
    expect(relativeTime(ago(30 * HOUR), now)).toBe("yesterday");
    expect(relativeTime(ago(3 * DAY), now)).toBe("3 days ago");
    expect(relativeTime(ago(14 * DAY), now)).toBe("2 weeks ago");
    expect(relativeTime(ago(70 * DAY), now)).toBe("2 months ago");
    expect(relativeTime(ago(800 * DAY), now)).toBe("2 years ago");
  });
});
