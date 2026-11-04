// Paging for a list the API returns a page at a time. `raw` is the ?page= query value, counted from 0.
export function pageInfo(total: number, raw: string | string[] | undefined, size: number) {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : 0;
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const pages = Math.max(1, Math.ceil(total / size));
  return { page, pages, prev: page > 0 ? page - 1 : null, next: page + 1 < pages ? page + 1 : null };
}

// The page numbers a pager shows, counted from 0: all of them when there are up to 7, otherwise the first, the last and
// the current with one on each side, with "..." for each gap. Always 7 slots, so the row never jumps or overflows a phone.
export function pageRange(page: number, pages: number): (number | "...")[] {
  const all = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const last = pages - 1;
  if (pages <= 7) return all(0, last);
  const current = Math.min(page, last);
  if (current <= 3) return [...all(0, 4), "...", last];
  if (current >= last - 3) return [0, "...", ...all(last - 4, last)];
  return [0, "...", current - 1, current, current + 1, "...", last];
}
