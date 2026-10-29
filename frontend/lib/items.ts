// Notes and Assets are both Items; each type has its own page.
export const itemHref = (item: { id: string; type: "NOTE" | "ASSET" }) =>
  `${item.type === "NOTE" ? "/notes" : "/assets"}/${item.id}`;

// Forms on an Item's page say where to come back to on failure. Only an Item page is accepted, so a form
// field can never send someone to another site or an unexpected page.
export function backTo(value: string, fallback: string) {
  return /^\/(notes|assets)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : fallback;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
