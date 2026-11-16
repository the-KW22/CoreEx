import type { components } from "@/lib/api/schema";

import { interviewLabel } from "./applications";

type Application = components["schemas"]["ApplicationResponse"];

export type CalendarEntry = { id: string; title: string; label: string; sort: string };

const DAY = 86_400_000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const isMonth = (value: unknown): value is string => typeof value === "string" && MONTH.test(value);
export const isDate = (value: unknown): value is string =>
  // The round trip rejects a day the month does not have, which Date.parse would roll into the next month.
  typeof value === "string" && DATE.test(value) && addDays(value, 0) === value;

// A zone name from a cookie is user input: anything the browser does not know is read as UTC.
export function safeZone(zone: string | undefined) {
  try {
    if (zone) new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone || "UTC";
  } catch {
    return "UTC";
  }
}

const parts = (zone: string, instant: Date, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", ...options })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );

// The calendar day an instant falls on for someone in `zone`, as "2026-11-20".
export function dayIn(zone: string, instant: string | Date) {
  const p = parts(zone, new Date(instant), { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

export function timeIn(zone: string, instant: string) {
  const p = parts(zone, new Date(instant), { hour: "2-digit", minute: "2-digit" });
  return `${p.hour}:${p.minute}`;
}

// Day arithmetic works on UTC midnights: a plain date has no zone.
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// The weeks (Monday first) that cover a month.
export function monthWeeks(month: string) {
  const weeks: string[][] = [];
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  for (let monday = mondayOf(`${month}-01`); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}

// Interviews and follow-up reminders by the day they fall on. An interview is an exact instant, so its day depends on
// the zone; a reminder is a plain day (with an optional time of day) and stays on that day everywhere.
export function entriesByDay(applications: Application[], zone: string) {
  const days = new Map<string, CalendarEntry[]>();
  const add = (day: string, entry: CalendarEntry) => days.set(day, [...(days.get(day) ?? []), entry]);
  for (const application of applications) {
    const { id, title } = application;
    for (const e of application.timeline.filter((t) => t.type === "INTERVIEW")) {
      const time = timeIn(zone, e.at);
      add(dayIn(zone, e.at), { id, title, label: `${time} ${interviewLabel(e.kind ?? null)} interview`, sort: time });
    }
    if (application.reminderOn) {
      const time = application.reminderTime?.slice(0, 5);
      add(application.reminderOn, { id, title, label: `${time ? `${time} ` : ""}Follow up`, sort: time ?? "09:00" });
    }
  }
  for (const list of days.values()) list.sort((a, b) => a.sort.localeCompare(b.sort) || a.title.localeCompare(b.title));
  return days;
}
