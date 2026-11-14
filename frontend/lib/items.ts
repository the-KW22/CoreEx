// Notes, Assets and Applications are all Items; each type has its own page.
const PAGES = { NOTE: "/notes", ASSET: "/assets", APPLICATION: "/career/applications" };
export const itemHref = (item: { id: string; type: keyof typeof PAGES }) => `${PAGES[item.type]}/${item.id}`;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export type ItemType = keyof typeof PAGES;

// The ?type= filter on the Items pages; anything but NOTE or ASSET means no filter.
export const parseType = (raw: string | string[] | undefined): ItemType | undefined =>
  raw === "NOTE" || raw === "ASSET" ? raw : undefined;

// A list page's link with its page number and type filter, which are left out when they are the defaults.
export function listHref(path: string, page: number, type?: ItemType) {
  const query = new URLSearchParams();
  if (page > 0) query.set("page", String(page));
  if (type) query.set("type", type);
  return query.size > 0 ? `${path}?${query}` : path;
}
