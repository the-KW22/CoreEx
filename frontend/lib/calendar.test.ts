import { describe, expect, it } from "vitest";

import type { components } from "@/lib/api/schema";

import { addDays, dayIn, entriesByDay, isDate, isMonth, mondayOf, monthWeeks, safeZone, shiftMonth, timeIn } from "./calendar";

type Application = components["schemas"]["ApplicationResponse"];

const application = (over: Partial<Application>): Application =>
  ({ id: "a1", title: "Dev at Acme", timeline: [], reminderOn: null, reminderTime: null, ...over }) as Application;

describe("calendar days", () => {
  it("puts an instant on the day it falls on in the zone, near midnight too", () => {
    // 2026-11-21 06:30 UTC is still the evening of the 20th in Los Angeles; 11:00 UTC on the 20th is already the 21st in Kiritimati.
    expect(dayIn("UTC", "2026-11-21T06:30:00Z")).toBe("2026-11-21");
    expect(dayIn("America/Los_Angeles", "2026-11-21T06:30:00Z")).toBe("2026-11-20");
    expect(timeIn("America/Los_Angeles", "2026-11-21T06:30:00Z")).toBe("22:30");
    expect(dayIn("Pacific/Kiritimati", "2026-11-20T11:00:00Z")).toBe("2026-11-21");
  });

  it("reads an unknown zone as UTC", () => {
    expect(safeZone("Not/AZone")).toBe("UTC");
    expect(safeZone(undefined)).toBe("UTC");
    expect(safeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("checks what the address carries", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2026-11-16")).toBe(true);
  });

  it("builds Monday-first weeks that cover the month", () => {
    const weeks = monthWeeks("2026-11"); // 1 Nov 2026 is a Sunday
    expect(weeks[0][0]).toBe("2026-10-26");
    expect(weeks[0][6]).toBe("2026-11-01");
    expect(weeks.at(-1)![6]).toBe("2026-12-06");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("entriesByDay", () => {
  it("shows an interview on the User's day and a reminder on its own day", () => {
    const days = entriesByDay(
      [
        application({
          timeline: [{ type: "INTERVIEW", at: "2026-11-21T06:30:00Z", seq: 1, kind: "VIDEO" } as Application["timeline"][number]],
          reminderOn: "2026-11-21",
          reminderTime: "14:00:00",
        }),
      ],
      "America/Los_Angeles",
    );
    expect(days.get("2026-11-20")?.[0].label).toBe("22:30 Video interview");
    expect(days.get("2026-11-21")?.[0].label).toBe("14:00 Follow up");
    expect(days.get("2026-11-21")).toHaveLength(1);
  });

  it("orders a day's entries by time, and a reminder without a time counts as 09:00", () => {
    const days = entriesByDay(
      [
        application({ id: "b", title: "B", reminderOn: "2026-11-20" }),
        application({ id: "c", title: "C", reminderOn: "2026-11-20", reminderTime: "08:00:00" }),
      ],
      "UTC",
    );
    expect(days.get("2026-11-20")?.map((e) => e.id)).toEqual(["c", "b"]);
  });
});
