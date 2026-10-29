const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// Largest first; months and years are averages, which is fine for "about when".
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

// "5 minutes ago", "yesterday", "2 weeks ago". Under a minute, or a clock slightly ahead of the server's, is "just now".
export function relativeTime(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso);
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return format.format(-Math.floor(elapsed / ms), unit);
  }
  return "just now";
}
