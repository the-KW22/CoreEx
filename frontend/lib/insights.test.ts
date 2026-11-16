import { describe, expect, it } from "vitest";

import type { components } from "@/lib/api/schema";

import { insights } from "./insights";

type Application = components["schemas"]["ApplicationResponse"];
type Entry = Application["timeline"][number];

const at = (date: string) => `${date}T12:00:00Z`;
const stage = (name: string, date: string, seq: number) => ({ type: "STAGE", stage: name, at: at(date), seq }) as Entry;
const replied = (date: string, seq: number) => ({ type: "REPLIED", at: at(date), seq }) as Entry;

// An Application applied to on `appliedOn`, with the timeline entries that came after.
const app = (appliedOn: string | null, stageNow: string, later: Entry[] = [], closeReason: string | null = null) =>
  ({
    stage: stageNow,
    closeReason,
    appliedOn: appliedOn ? at(appliedOn) : null,
    timeline: [stage("SAVED", "2026-01-01", 1), ...(appliedOn ? [stage("APPLIED", appliedOn, 2)] : []), ...later],
  }) as unknown as Application;

describe("insights", () => {
  it("counts only Applications that were applied to, and says nothing when there are none", () => {
    expect(insights([app(null, "SAVED")]).applied).toBe(0);
    const empty = insights([]);
    expect(empty.replyRate).toBeNull();
    expect(empty.medianReplyDays).toBeNull();
    expect(empty.funnel.every((f) => f.count === 0)).toBe(true);
  });

  it("counts a reply from a logged reply, a move on, or an answer that closed it", () => {
    const list = [
      app("2026-02-01", "APPLIED", [replied("2026-02-04", 3)]),
      app("2026-02-01", "SCREENING", [stage("SCREENING", "2026-02-06", 3)]),
      app("2026-02-01", "CLOSED", [stage("CLOSED", "2026-02-10", 3)], "NOT_SELECTED"),
      app("2026-02-01", "CLOSED", [stage("CLOSED", "2026-02-20", 3)], "NO_RESPONSE"),
      app("2026-02-01", "APPLIED"),
    ];
    const result = insights(list);
    expect(result.applied).toBe(5);
    expect(result.replied).toBe(3);
    expect(result.replyRate).toBe(60);
  });

  it("takes the median days to the first reply, by the entry's own (back-dated) date", () => {
    const list = [
      app("2026-02-01", "APPLIED", [replied("2026-02-04", 3), replied("2026-02-20", 4)]), // 3 days: the first one counts
      app("2026-02-01", "SCREENING", [stage("SCREENING", "2026-02-11", 3)]), // 10
      app("2026-02-01", "SCREENING", [stage("SCREENING", "2026-02-06", 3)]), // 5
      app("2026-02-01", "APPLIED"), // never answered: not in the median
    ];
    expect(insights(list).medianReplyDays).toBe(5);
    // An even count takes the middle two.
    expect(insights(list.slice(0, 2)).medianReplyDays).toBe(6.5);
  });

  it("never reports a negative wait for a reply back-dated before the applied day", () => {
    expect(insights([app("2026-02-10", "APPLIED", [replied("2026-02-01", 3)])]).medianReplyDays).toBe(0);
  });

  it("counts how far they got, each step including everything past it", () => {
    const list = [
      app("2026-02-01", "APPLIED"),
      app("2026-02-01", "SCREENING", [stage("SCREENING", "2026-02-05", 3)]),
      app("2026-02-01", "INTERVIEW", [stage("SCREENING", "2026-02-05", 3), stage("INTERVIEW", "2026-02-08", 4)]),
      // Closed after an interview still got that far.
      app("2026-02-01", "CLOSED", [stage("INTERVIEW", "2026-02-08", 3), stage("CLOSED", "2026-02-12", 4)], "NOT_SELECTED"),
      app("2026-02-01", "OFFER", [stage("OFFER", "2026-02-15", 3)]),
    ];
    expect(insights(list).funnel).toEqual([
      { stage: "APPLIED", count: 5 },
      { stage: "SCREENING", count: 4 },
      { stage: "INTERVIEW", count: 3 },
      { stage: "OFFER", count: 1 },
    ]);
  });

  it("lists close reasons, the most common first", () => {
    const closed = (reason: string) => app("2026-02-01", "CLOSED", [stage("CLOSED", "2026-02-12", 3)], reason);
    const result = insights([closed("WITHDREW"), closed("NO_RESPONSE"), closed("NO_RESPONSE")]);
    expect(result.closeReasons).toEqual([
      { reason: "NO_RESPONSE", count: 2 },
      { reason: "WITHDREW", count: 1 },
    ]);
  });

  it("narrows to the range by the applied day, both ends included", () => {
    const list = [app("2026-01-31", "APPLIED"), app("2026-02-01", "APPLIED"), app("2026-02-28", "APPLIED"), app("2026-03-01", "APPLIED")];
    expect(insights(list, { from: "2026-02-01", to: "2026-02-28" }).applied).toBe(2);
    expect(insights(list, { from: "2026-02-15" }).applied).toBe(2);
    expect(insights(list, { to: "2026-01-31" }).applied).toBe(1);
  });
});
