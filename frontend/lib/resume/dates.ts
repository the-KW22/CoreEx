// Resume dates are stored as ISO text ("2021", "2021-03", "2021-03-15"), and "present" for an end that is still going.
// One format prints them all, so a Resume never mixes "Mar 2021" with "03/2022".
export type DateFormat = "MMM_YYYY" | "MM_YYYY" | "YYYY_MM" | "YYYY";

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "MMM_YYYY", label: "Mar 2021" },
  { value: "MM_YYYY", label: "03/2021" },
  { value: "YYYY_MM", label: "2021-03" },
  { value: "YYYY", label: "2021" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A stored date in the chosen format. Text that is not a date is printed as typed, so nothing the User wrote is lost;
// a year-only date stays a year in every format.
export function formatDate(stored: string, format: string): string {
  const text = stored.trim();
  if (text.toLowerCase() === "present") return "Present";
  const match = /^(\d{4})(?:-(\d{2}))?(?:-\d{2})?$/.exec(text);
  if (!match) return text;
  const [, year, month] = match;
  const m = Number(month);
  if (!month || m < 1 || m > 12 || format === "YYYY") return year;
  if (format === "MM_YYYY") return `${month}/${year}`;
  if (format === "YYYY_MM") return `${year}-${month}`;
  return `${MONTHS[m - 1]} ${year}`;
}

// "Mar 2021 - Present", "2018", or "" when there is nothing to show.
export function formatSpan(start: string, end: string, format: string): string {
  return [start, end]
    .map((d) => formatDate(d, format))
    .filter(Boolean)
    .join(" - ");
}
