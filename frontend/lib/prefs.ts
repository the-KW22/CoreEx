// What the Items pages remember about how the User likes to look at them, kept in cookies so the server renders the
// right thing on the first paint.

export type ItemsView = "list" | "grid";

// Like Google Drive, the Items open as a grid until the User chooses the list.
export const parseView = (value: string | undefined): ItemsView => (value === "list" ? "list" : "grid");

// The ids of the sections the User has collapsed, as a comma list.
export const parseCollapsed = (value: string | undefined) => new Set((value ?? "").split(",").filter(Boolean));

// The cookie value after one section is collapsed or opened.
export function withCollapsed(value: string | undefined, id: string, collapsed: boolean) {
  const ids = parseCollapsed(value);
  if (collapsed) ids.add(id);
  else ids.delete(id);
  return [...ids].join(",");
}
