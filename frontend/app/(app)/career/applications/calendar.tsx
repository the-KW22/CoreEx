import Link from "next/link";

import type { components } from "@/lib/api/schema";
import { addDays, entriesByDay, isDate, isMonth, mondayOf, monthWeeks, shiftMonth } from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Application = components["schemas"]["ApplicationResponse"];

const BASE = "/career/applications?view=calendar";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthName = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDay = (day: string, withYear = false) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });

const linkClass = "rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface";

// The Calendar (docs/DESIGN.md section 6.4b): interviews and follow-up reminders, by the day they fall on in the
// User's timezone. A month of weeks on a wide screen; on a phone one week at a time. Pure server rendering: the month
// and the week are in the address.
export function Calendar({
  applications,
  zone,
  today,
  month: rawMonth,
  week: rawWeek,
}: {
  applications: Application[];
  zone: string;
  today: string;
  month?: string;
  week?: string;
}) {
  const thisMonth = today.slice(0, 7);
  const month = isMonth(rawMonth) ? rawMonth : thisMonth;
  const weekStart = isDate(rawWeek)
    ? mondayOf(rawWeek)
    : mondayOf(month === thisMonth ? today : `${month}-01`);
  const keep = isMonth(rawMonth) ? `&month=${rawMonth}` : "";
  const days = entriesByDay(applications, zone);

  const weeks = monthWeeks(month).map((week) => ({ days: week, phone: week[0] === weekStart }));
  // The phone's week can be outside the month shown: it then has a row of its own, for the phone only.
  const phoneOnly = !weeks.some((w) => w.phone);
  const rows = phoneOnly
    ? [...weeks.map((w) => ({ ...w, phoneOnly: false })), { days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), phone: true, phoneOnly: true }]
    : weeks.map((w) => ({ ...w, phoneOnly: false }));

  return (
    <section aria-label="Calendar" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">
          <span className="hidden md:inline">{monthName(month)}</span>
          <span className="md:hidden">
            {shortDay(weekStart)} to {shortDay(addDays(weekStart, 6), true)}
          </span>
        </h2>
        <nav aria-label="Month" className="hidden gap-2 md:flex">
          <Link href={`${BASE}&month=${shiftMonth(month, -1)}`} className={linkClass}>
            Previous month
          </Link>
          <Link href={BASE} className={linkClass}>
            Today
          </Link>
          <Link href={`${BASE}&month=${shiftMonth(month, 1)}`} className={linkClass}>
            Next month
          </Link>
        </nav>
        <nav aria-label="Week" className="flex gap-2 md:hidden">
          <Link href={`${BASE}${keep}&week=${addDays(weekStart, -7)}`} className={linkClass}>
            Previous week
          </Link>
          <Link href={BASE} className={linkClass}>
            Today
          </Link>
          <Link href={`${BASE}${keep}&week=${addDays(weekStart, 7)}`} className={linkClass}>
            Next week
          </Link>
        </nav>
      </div>

      <div aria-hidden className="hidden grid-cols-7 gap-2 text-sm text-muted-foreground md:grid">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid gap-2">
        {rows.map((row) => (
          <ol
            key={row.days[0] + (row.phoneOnly ? "p" : "")}
            className={cn(
              "gap-2 md:grid-cols-7",
              row.phoneOnly ? "grid md:hidden" : row.phone ? "grid" : "hidden md:grid",
            )}
          >
            {row.days.map((day, i) => {
              const entries = days.get(day) ?? [];
              const inMonth = day.startsWith(month);
              return (
                <li key={day} className={cn("grid min-h-20 content-start gap-1 rounded-[10px] border border-border p-2", !inMonth && "bg-surface")}>
                  <h3 className={cn("text-sm", day === today && "font-semibold")}>
                    <time dateTime={day} aria-current={day === today ? "date" : undefined}>
                      <span className="md:hidden">{WEEKDAYS[i]} </span>
                      {Number(day.slice(8))}
                      {day === today && " (today)"}
                    </time>
                  </h3>
                  {entries.length > 0 && (
                    <ul className="grid gap-1">
                      {entries.map((entry, n) => (
                        <li key={`${entry.id}-${n}`}>
                          <Link
                            href={`/career/applications/${entry.id}`}
                            className="grid gap-0.5 break-words rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface"
                          >
                            <span className="font-medium">{entry.label}</span>
                            <span className="text-muted-foreground">{entry.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </section>
  );
}
