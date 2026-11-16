import { BriefcaseBusinessIcon, FileTextIcon, FileUserIcon, ImageIcon } from "lucide-react";

// What each Item type looks like in a list: its icon and the word a screen reader says.
export const TYPE_LOOK = {
  NOTE: { Icon: FileTextIcon, label: "Note" },
  ASSET: { Icon: ImageIcon, label: "Asset" },
  APPLICATION: { Icon: BriefcaseBusinessIcon, label: "Application" },
  RESUME: { Icon: FileUserIcon, label: "Resume" },
};

// Notes, Assets, Applications and Resumes are all Items; each type has its own page.
const PAGES = { NOTE: "/notes", ASSET: "/assets", APPLICATION: "/career/applications", RESUME: "/career/resumes" };
export const itemHref = (item: { id: string; type: keyof typeof PAGES }) => `${PAGES[item.type]}/${item.id}`;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export type ItemType = keyof typeof PAGES;

// The ?type= filter on the Items pages; anything but a known type means no filter.
export const parseType = (raw: string | string[] | undefined): ItemType | undefined =>
  raw === "NOTE" || raw === "ASSET" || raw === "APPLICATION" || raw === "RESUME" ? raw : undefined;

// A list page's link with its page number and type filter, which are left out when they are the defaults.
export function listHref(path: string, page: number, type?: ItemType) {
  const query = new URLSearchParams();
  if (page > 0) query.set("page", String(page));
  if (type) query.set("type", type);
  return query.size > 0 ? `${path}?${query}` : path;
}
