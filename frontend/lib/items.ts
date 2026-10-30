// Notes and Assets are both Items; each type has its own page.
export const itemHref = (item: { id: string; type: "NOTE" | "ASSET" }) =>
  `${item.type === "NOTE" ? "/notes" : "/assets"}/${item.id}`;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
