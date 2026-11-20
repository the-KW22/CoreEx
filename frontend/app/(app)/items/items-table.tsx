"use client";

import { FileTextIcon, FolderInputIcon, ImageIcon, TagIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TagBadge } from "@/components/tag-badge";
import type { Folder } from "@/lib/folders";
import { formatBytes, itemHref } from "@/lib/items";

import { type Item, ItemMenus, itemTitle } from "./item-menus";

const SHOWN_TAGS = 2;
const iconButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground pointer-coarse:size-11";

// The first Tags and a "+N" chip that opens the rest, so a row with many Tags never widens the table.
function TagsCell({ tags }: { tags: Item["tags"] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex max-w-56 items-center gap-1 overflow-hidden">
      <ul aria-label="Tags" className="flex min-w-0 gap-1">
        {tags.slice(0, SHOWN_TAGS).map((tag) => (
          <li key={tag.id} className="min-w-0 truncate">
            <TagBadge name={tag.name} colour={tag.colour} className="max-w-full truncate" />
          </li>
        ))}
      </ul>
      {tags.length > SHOWN_TAGS && (
        <Popover>
          <PopoverTrigger
            aria-label={`${tags.length - SHOWN_TAGS} more Tags`}
            className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            +{tags.length - SHOWN_TAGS}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-64">
            <ul aria-label="All Tags" className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <TagBadge name={tag.name} colour={tag.colour} />
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// An icon button with a tooltip and an accessible name.
function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} onClick={onClick} className={iconButton}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// The List view: a row per Item. The whole row opens it; the checkboxes select Items for the bar above the table.
export function ItemsTable({
  items,
  folders,
  tags,
}: {
  items: Item[];
  folders: Folder[];
  tags: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selection follows the Items on the page: paging or filtering drops the ones no longer shown.
  const [shown, setShown] = useState(items);
  if (shown !== items) {
    setShown(items);
    const ids = new Set(items.map((item) => item.id));
    setSelected(new Set([...selected].filter((id) => ids.has(id))));
  }

  const folderNames = new Map(folders.map((f) => [f.id, f.name]));
  const chosen = items.filter((item) => selected.has(item.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };
  const keepFailed = (failed: Item[]) => setSelected(new Set(failed.map((item) => item.id)));

  return (
    <ItemMenus folders={folders} tags={tags}>
      {({ run, openNewTab, contextMenu }) => (
        <>
          {chosen.length > 0 && (
            <div role="region" aria-label="Selected Items" className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
              <span className="mr-2 font-medium">{chosen.length} selected</span>
              <Button type="button" variant="outline" size="sm" onClick={() => run("tag", chosen, keepFailed)}>
                <TagIcon aria-hidden /> Add Tag
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => run("move", chosen, keepFailed)}>
                <FolderInputIcon aria-hidden /> Move to Folder
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => run("trash", chosen, keepFailed)}>
                <Trash2Icon aria-hidden /> Move to Trash
              </Button>
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}
          <table className="w-full border-collapse text-sm max-md:block">
            <caption className="sr-only">Items, most recently updated first</caption>
            <thead className="text-left text-xs font-medium text-muted-foreground max-md:hidden">
              <tr className="border-b border-border">
                <th scope="col" className="w-8 py-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Select all Items on this page"
                    checked={chosen.length === items.length && items.length > 0}
                    ref={(box) => {
                      if (box) box.indeterminate = chosen.length > 0 && chosen.length < items.length;
                    }}
                    onChange={(event) => setSelected(new Set(event.target.checked ? items.map((item) => item.id) : []))}
                    className="size-4 accent-primary"
                  />
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">Title</th>
                <th scope="col" className="py-2 pr-4 font-medium">Folder</th>
                <th scope="col" className="py-2 pr-4 font-medium">Tags</th>
                <th scope="col" className="py-2 pr-4 font-medium">Size</th>
                <th scope="col" className="py-2 pr-4 font-medium">Updated</th>
                <th scope="col" className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-md:grid max-md:gap-2">
              {items.map((item) => {
                const Icon = item.type === "NOTE" ? FileTextIcon : ImageIcon;
                const name = itemTitle(item);
                const on = selected.has(item.id);
                return (
                  <ContextMenu key={item.id}>
                    <ContextMenuTrigger asChild>
                      <tr
                        data-selected={on || undefined}
                        // The whole row opens the Item, except a click on a control inside it. Ctrl/Cmd-click and a
                        // middle click open a new tab, as on a link.
                        onClick={(event) => {
                          // A Popover inside the row is drawn elsewhere in the page, so a click in it is not in the row.
                          if (!event.currentTarget.contains(event.target as Node)) return;
                          if ((event.target as HTMLElement).closest("a, button, input, label")) return;
                          if (event.ctrlKey || event.metaKey) openNewTab(item);
                          else router.push(itemHref(item));
                        }}
                        onAuxClick={(event) => {
                          if (event.button === 1 && !(event.target as HTMLElement).closest("a, button, input")) openNewTab(item);
                        }}
                        className="cursor-pointer border-b border-border-subtle hover:bg-surface data-selected:bg-surface-raised max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:rounded-[10px] max-md:border max-md:border-border max-md:p-3"
                      >
                        <td className="w-8 py-2 pr-2 max-md:col-start-1 max-md:row-span-5 max-md:row-start-1 max-md:self-center max-md:p-0 max-md:pr-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${name}`}
                            checked={on}
                            onChange={(event) => toggle(item.id, event.target.checked)}
                            className="size-4 accent-primary pointer-coarse:size-6"
                          />
                        </td>
                        {/* w-full max-w-0: the title takes the leftover width and truncates, instead of widening the table. */}
                        <td className="py-2 pr-4 max-md:col-start-2 max-md:p-0 md:w-full md:max-w-0">
                          <Link href={itemHref(item)} className="flex items-center gap-2 font-medium text-foreground hover:underline">
                            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                            <span className="sr-only">{item.type === "NOTE" ? "Note:" : "Asset:"}</span>
                            <span className="truncate" title={name}>
                              {name}
                            </span>
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground max-md:col-start-2 max-md:p-0 max-md:pl-6 max-md:text-xs">
                          {item.folderId ? (folderNames.get(item.folderId) ?? "") : "Top level"}
                        </td>
                        <td className="py-2 pr-4 max-md:col-start-2 max-md:p-0 max-md:pl-6 max-md:empty:hidden">
                          <TagsCell tags={item.tags} />
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground max-md:col-start-2 max-md:p-0 max-md:pl-6">
                          {item.sizeBytes == null ? "" : formatBytes(item.sizeBytes)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground max-md:col-start-2 max-md:p-0 max-md:pl-6 max-md:text-xs">
                          <time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time>
                        </td>
                        <td className="py-1 max-md:col-start-3 max-md:row-span-5 max-md:row-start-1 max-md:self-center max-md:p-0">
                          <div className="flex items-center justify-end">
                            <IconAction label={`Move ${name} to a Folder`} onClick={() => run("move", [item])}>
                              <FolderInputIcon aria-hidden className="size-4" />
                            </IconAction>
                            <IconAction label={`Add a Tag to ${name}`} onClick={() => run("tag", [item])}>
                              <TagIcon aria-hidden className="size-4" />
                            </IconAction>
                            <IconAction label={`Move ${name} to the Trash`} onClick={() => run("trash", [item])}>
                              <Trash2Icon aria-hidden className="size-4" />
                            </IconAction>
                          </div>
                        </td>
                      </tr>
                    </ContextMenuTrigger>
                    {contextMenu(item)}
                  </ContextMenu>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </ItemMenus>
  );
}
