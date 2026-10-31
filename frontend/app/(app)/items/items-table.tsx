"use client";

import { FileTextIcon, ImageIcon } from "lucide-react";
import Link from "next/link";

import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { Folder } from "@/lib/folders";
import { itemHref } from "@/lib/items";

import { type Item, ItemMenus, itemTitle } from "./item-menus";

const menuButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground pointer-coarse:size-11";

// The List view: a table, which becomes cards on a phone.
export function ItemsTable({
  items,
  folders,
  tags,
}: {
  items: Item[];
  folders: Folder[];
  tags: { id: string; name: string }[];
}) {
  const folderNames = new Map(folders.map((f) => [f.id, f.name]));

  return (
    <ItemMenus folders={folders} tags={tags}>
      {({ menuButton: button, contextMenu }) => (
        <table className="w-full border-collapse text-sm max-md:block">
          <caption className="sr-only">Items, most recently updated first</caption>
          <thead className="text-left text-xs font-medium text-muted-foreground max-md:hidden">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4 font-medium">Title</th>
              <th scope="col" className="py-2 pr-4 font-medium">Folder</th>
              <th scope="col" className="py-2 pr-4 font-medium">Updated</th>
              <th scope="col" className="w-10 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="max-md:grid max-md:gap-2">
            {items.map((item) => {
              const Icon = item.type === "NOTE" ? FileTextIcon : ImageIcon;
              return (
                <ContextMenu key={item.id}>
                  <ContextMenuTrigger asChild>
                    <tr className="border-b border-border-subtle hover:bg-surface max-md:grid max-md:grid-cols-[1fr_auto] max-md:rounded-[10px] max-md:border max-md:border-border max-md:p-3">
                      <td className="py-2 pr-4 max-md:p-0">
                        <Link href={itemHref(item)} className="flex items-center gap-2 font-medium text-foreground hover:underline">
                          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          <span className="sr-only">{item.type === "NOTE" ? "Note:" : "Asset:"}</span>
                          <span className="truncate">{itemTitle(item)}</span>
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground max-md:col-start-1 max-md:p-0 max-md:pl-6 max-md:text-xs">
                        {item.folderId ? (folderNames.get(item.folderId) ?? "") : "Top level"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground max-md:col-start-1 max-md:p-0 max-md:pl-6 max-md:text-xs">
                        <time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time>
                      </td>
                      <td className="py-1 text-right max-md:col-start-2 max-md:row-span-3 max-md:row-start-1 max-md:self-center max-md:p-0">
                        {button(item, menuButton)}
                      </td>
                    </tr>
                  </ContextMenuTrigger>
                  {contextMenu(item)}
                </ContextMenu>
              );
            })}
          </tbody>
        </table>
      )}
    </ItemMenus>
  );
}
