import { describe, expect, it } from "vitest";

import { formatMoney, untilReset, usagePercent } from "./chat-usage";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const resetIn = (ms: number) => new Date(NOW + ms).toISOString();
const MINUTE = 60_000;

describe("formatMoney", () => {
  it("shows dollars with two decimals", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(0.12)).toBe("$0.12");
    expect(formatMoney(0.5)).toBe("$0.50");
  });
});

describe("usagePercent", () => {
  it("covers nothing used, part used, and over budget", () => {
    expect(usagePercent(0, 0.5)).toBe(0);
    expect(usagePercent(0.1234, 0.5)).toBe(25);
    expect(usagePercent(0.5, 0.5)).toBe(100);
    expect(usagePercent(0.75, 0.5)).toBe(100);
  });

  it("counts a zero budget as used up", () => {
    expect(usagePercent(0, 0)).toBe(100);
  });
});

describe("untilReset", () => {
  it("gives hours and minutes", () => {
    expect(untilReset(resetIn(312 * MINUTE), NOW)).toBe("in 5 h 12 min");
  });

  it("gives whole hours when no minutes are left", () => {
    expect(untilReset(resetIn(5 * 60 * MINUTE), NOW)).toBe("in 5 h");
  });

  it("gives minutes under an hour, rounding up", () => {
    expect(untilReset(resetIn(12 * MINUTE), NOW)).toBe("in 12 min");
    expect(untilReset(resetIn(30_000), NOW)).toBe("in 1 min");
  });

  it("says now once the reset time has passed", () => {
    expect(untilReset(resetIn(-MINUTE), NOW)).toBe("now");
  });
});
