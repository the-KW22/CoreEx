"use client";

import { FileUpIcon, MoreHorizontalIcon, UploadIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmTrash } from "@/components/confirm-trash";
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { components } from "@/lib/api/schema";
import type { Folder } from "@/lib/folders";
import { itemHref } from "@/lib/items";

import { openUpload } from "../assets/uploads";
import { FolderSelect } from "../folders/folder-select";
import { moveItemTo, restoreItem, tagItem, trashItem } from "./actions";

export type Item = components["schemas"]["ItemResponse"];

// What the Dialog or the confirmation is for: one Item (a menu) or several (the bulk bar). `onDone` gets the Items that
// failed, so the bulk bar can keep them selected.
type Op = { kind: "move" | "tag" | "trash"; items: Item[]; opener: HTMLElement | null; onDone?: (failed: Item[]) => void };

export const itemTitle = (item: Item) => item.title || "Untitled";

// Upload and Import open the Upload dialog.
export function PickButton({ kind, label }: { kind: "upload" | "import"; label?: string }) {
  const Icon = kind === "upload" ? UploadIcon : FileUpIcon;
  return (
    <Button type="button" variant="outline" onClick={() => openUpload(kind)}>
      <Icon aria-hidden />
      {label ?? (kind === "upload" ? "Upload" : "Import")}
    </Button>
  );
}

// The same actions in an Item's "⋯" menu and its right-click menu; `Entry` and `Separator` are the menu's parts. There is
// no "Open": the Item's own card or row opens it.
function RowActions({
  Entry,
  Separator,
  onOpenNewTab,
  onOp,
}: {
  Entry: typeof DropdownMenuItem | typeof ContextMenuItem;
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator;
  onOpenNewTab: () => void;
  onOp: (kind: Op["kind"]) => void;
}) {
  return (
    <>
      {/* Our right-click menu replaces the browser's, so it keeps the browser's most-used choice. */}
      <Entry onSelect={onOpenNewTab}>Open in new tab</Entry>
      <Entry onSelect={() => onOp("move")}>Move to Folder…</Entry>
      <Entry onSelect={() => onOp("tag")}>Add Tag…</Entry>
      <Separator />
      <Entry variant="destructive" onSelect={() => onOp("trash")}>
        Move to Trash
      </Entry>
    </>
  );
}

type Menus = {
  /** The "⋯" button and its menu. */
  menuButton: (item: Item, className: string) => React.ReactNode;
  /** The right-click menu's content, for a ContextMenu around the Item. */
  contextMenu: (item: Item) => React.ReactNode;
  /** Move, tag or trash these Items (the Dialog or the confirmation opens). `onDone` gets those that failed. */
  run: (kind: Op["kind"], items: Item[], onDone?: (failed: Item[]) => void) => void;
  /** Open an Item in a new tab. */
  openNewTab: (item: Item) => void;
};

const plural = (n: number) => (n === 1 ? "1 Item" : `${n} Items`);

// The menus and Dialogs every way of showing Items shares (the list and the grid): Open in new tab, Move to Folder, Add Tag
// and Move to Trash (after a confirmation, with Undo), for one Item or a selection. `children` draws the Items and hands
// each its menus.
export function ItemMenus({
  folders,
  tags,
  children,
}: {
  folders: Folder[];
  tags: { id: string; name: string }[];
  children: (menus: Menus) => React.ReactNode;
}) {
  const [op, setOp] = useState<Op | null>(null);
  const [pending, startTransition] = useTransition();

  // What had focus when the Dialog opened: focus goes back there (a menu item that opened it is gone by then, so the
  // Item's "⋯" button is the fallback).
  const [open, setOpen] = useState(false);
  const run: Menus["run"] = (kind, items, onDone) => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOp({ kind, items, opener, onDone });
    setOpen(true);
  };

  // shortcut: one server call per Item, so a big selection is slow and not atomic; add POST /api/items/bulk when
  // selections pass about 100 Items.
  async function each(items: Item[], call: (item: Item) => Promise<boolean>) {
    const failed: Item[] = [];
    for (const item of items) if (!(await call(item))) failed.push(item);
    return { ok: items.filter((item) => !failed.includes(item)), failed };
  }

  // Some worked and some did not: say how many of each. True when it was such a mix.
  function mixed(ok: Item[], failed: Item[], what: string) {
    if (ok.length === 0 || failed.length === 0) return false;
    toast.error(`${what} ${plural(ok.length)}; ${plural(failed.length)} could not be changed. Those stay selected.`);
    return true;
  }

  function trash(current: Op) {
    const { items, onDone } = current;
    setOpen(false);
    startTransition(async () => {
      const { ok, failed } = await each(items, (item) => trashItem(item.id, item.type));
      onDone?.(failed);
      if (ok.length === 0) {
        toast.error(`Could not move ${items.length === 1 ? `"${itemTitle(items[0])}"` : plural(items.length)} to the Trash. Try again.`);
        return;
      }
      mixed(ok, failed, "Moved");
      toast.success(`Moved ${ok.length === 1 ? `"${itemTitle(ok[0])}"` : plural(ok.length)} to the Trash`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const back = await each(ok, (item) => restoreItem(item.id));
              if (back.failed.length > 0) toast.error(`Could not bring back ${plural(back.failed.length)}. Try the Trash.`);
            }),
        },
      });
    });
  }

  function submit(formData: FormData) {
    if (!op) return;
    const { kind, items, onDone } = op;
    startTransition(async () => {
      const folderId = String(formData.get("folderId") ?? "") || null;
      const name = String(formData.get("name") ?? "");
      const { ok, failed } = await each(items, (item) => (kind === "move" ? moveItemTo(item.id, folderId) : tagItem(item.id, name)));
      onDone?.(failed);
      if (ok.length === 0) {
        toast.error(kind === "move" ? "Could not move the Item. Try again." : "Could not add the Tag. Try again.");
        return;
      }
      setOpen(false);
      const what = kind === "move" ? "Moved" : "Tagged";
      if (!mixed(ok, failed, what)) toast.success(`${what} ${ok.length === 1 ? `"${itemTitle(ok[0])}"` : plural(ok.length)}`);
    });
  }

  const actions = (item: Item, menu: "dropdown" | "context") => (
    <RowActions
      Entry={menu === "dropdown" ? DropdownMenuItem : ContextMenuItem}
      Separator={menu === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator}
      onOpenNewTab={() => window.open(itemHref(item), "_blank", "noopener")}
      onOp={(kind) => run(kind, [item])}
    />
  );

  const menus: Menus = {
    run,
    openNewTab: (item) => window.open(itemHref(item), "_blank", "noopener"),
    menuButton: (item, className) => (
      <DropdownMenu>
        <DropdownMenuTrigger id={`actions-${item.id}`} aria-label={`Actions for ${itemTitle(item)}`} className={className}>
          <MoreHorizontalIcon aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {actions(item, "dropdown")}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    contextMenu: (item) => <ContextMenuContent className="min-w-44">{actions(item, "context")}</ContextMenuContent>,
  };

  const dialog = open && op && op.kind !== "trash" ? op : null;
  return (
    <>
      {children(menus)}

      <ConfirmTrash
        names={open && op?.kind === "trash" ? op.items.map(itemTitle) : null}
        onConfirm={() => op && trash(op)}
        onCancel={() => setOpen(false)}
      />

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setOpen(false)}>
        <DialogContent
          className="border-border bg-popover sm:max-w-sm"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const back = op?.opener?.isConnected ? op.opener : document.getElementById(`actions-${op?.items[0]?.id}`);
            back?.focus();
          }}
        >
          {dialog && (
            <form action={submit} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>{dialog.kind === "move" ? "Move to Folder" : "Add a Tag"}</DialogTitle>
                <DialogDescription>{dialog.items.length === 1 ? itemTitle(dialog.items[0]) : plural(dialog.items.length)}</DialogDescription>
              </DialogHeader>
              {dialog.kind === "move" ? (
                <FolderSelect
                  name="folderId"
                  label="Folder"
                  folders={folders}
                  selected={dialog.items.length === 1 ? dialog.items[0].folderId : null}
                />
              ) : (
                <label className="grid gap-1.5 text-sm font-medium">
                  Tag name
                  <input
                    name="name"
                    list="row-tag-suggestions"
                    required
                    maxLength={50}
                    autoComplete="off"
                    autoFocus
                    className="h-9 rounded-lg border border-border bg-surface px-3 font-normal"
                  />
                  <datalist id="row-tag-suggestions">
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.name} />
                    ))}
                  </datalist>
                </label>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {dialog.kind === "move" ? "Move" : "Add Tag"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
