// Paging for a list the API returns a page at a time. `raw` is the ?page= query value, counted from 0.
export function pageInfo(total: number, raw: string | string[] | undefined, size: number) {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : 0;
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const pages = Math.max(1, Math.ceil(total / size));
  return { page, pages, prev: page > 0 ? page - 1 : null, next: page + 1 < pages ? page + 1 : null };
}
