"use client";

import { FileTextIcon, ImageIcon } from "lucide-react";
import Link from "next/link";

import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { Folder } from "@/lib/folders";
import { itemHref } from "@/lib/items";

import { type Item, ItemMenus, itemTitle } from "./item-menus";

const menuButton =
  "relative z-10 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground aria-expanded:bg-surface-raised pointer-coarse:size-11";

// The Grid view: a card per Item, like Google Drive's files. The title's link covers the whole card, and the "⋯"
// button sits above it.
export function ItemsGrid({
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
        <ul aria-label="Items, most recently updated first" className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {items.map((item) => {
            const Icon = item.type === "NOTE" ? FileTextIcon : ImageIcon;
            return (
              <li key={item.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="group relative grid overflow-hidden rounded-[14px] border border-border bg-surface transition-colors focus-within:border-link hover:border-link">
                      <div className="grid h-24 place-items-center bg-panel text-muted-foreground">
                        <Icon aria-hidden className="size-8" />
                      </div>
                      <div className="flex items-start gap-1 p-3 pr-2">
                        <div className="grid min-w-0 flex-1 gap-0.5">
                          <Link
                            href={itemHref(item)}
                            className="truncate text-sm font-medium text-foreground outline-none after:absolute after:inset-0 after:content-['']"
                          >
                            <span className="sr-only">{item.type === "NOTE" ? "Note: " : "Asset: "}</span>
                            {itemTitle(item)}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.folderId ? (folderNames.get(item.folderId) ?? "") : "Top level"}
                            {" · "}
                            <time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time>
                          </p>
                        </div>
                        {button(item, menuButton)}
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  {contextMenu(item)}
                </ContextMenu>
              </li>
            );
          })}
        </ul>
      )}
    </ItemMenus>
  );
}
