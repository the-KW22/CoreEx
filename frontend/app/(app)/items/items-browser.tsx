"use client";

import type { Folder } from "@/lib/folders";
import type { ItemsView } from "@/lib/prefs";

import { ItemsGrid } from "./items-grid";
import { ItemsTable } from "./items-table";
import type { Item } from "./item-menus";
import { useView } from "./view-state";

// The Items of a page in the view the User chose (the toggle in the header sets it).
export function ItemsBrowser({
  saved,
  items,
  folders,
  tags,
}: {
  saved: ItemsView;
  items: Item[];
  folders: Folder[];
  tags: { id: string; name: string }[];
}) {
  const View = useView(saved) === "list" ? ItemsTable : ItemsGrid;
  return <View items={items} folders={folders} tags={tags} />;
}
