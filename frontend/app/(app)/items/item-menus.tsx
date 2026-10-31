"use client";

import { FileUpIcon, MoreHorizontalIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
type Dialogs = { kind: "move" | "tag"; item: Item } | null;

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

// The same four actions in an Item's "⋯" menu and its right-click menu; `Entry` and `Separator` are the menu's parts.
function RowActions({
  Entry,
  Separator,
  onOpen,
  onOpenNewTab,
  onDialog,
  onTrash,
}: {
  Entry: typeof DropdownMenuItem | typeof ContextMenuItem;
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator;
  onOpen: () => void;
  onOpenNewTab: () => void;
  onDialog: (kind: "move" | "tag") => void;
  onTrash: () => void;
}) {
  return (
    <>
      <Entry onSelect={onOpen}>Open</Entry>
      {/* Our right-click menu replaces the browser's, so it keeps the browser's most-used choice. */}
      <Entry onSelect={onOpenNewTab}>Open in new tab</Entry>
      <Entry onSelect={() => onDialog("move")}>Move to Folder…</Entry>
      <Entry onSelect={() => onDialog("tag")}>Add Tag…</Entry>
      <Separator />
      <Entry variant="destructive" onSelect={onTrash}>
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
};

// The menus and Dialogs every way of showing Items shares (the list and the grid): Open, Move to Folder, Add Tag and Move
// to Trash with Undo. `children` draws the Items and hands each its menus.
export function ItemMenus({
  folders,
  tags,
  children,
}: {
  folders: Folder[];
  tags: { id: string; name: string }[];
  children: (menus: Menus) => React.ReactNode;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, startTransition] = useTransition();

  // The Item a Dialog was for, kept past its closing: focus goes back to that Item's "⋯" button, as the menu item that
  // opened the Dialog is gone.
  const lastItem = useRef<Item>(null);
  const openDialog = (kind: "move" | "tag", item: Item) => {
    lastItem.current = item;
    setDialog({ kind, item });
  };

  function trash(item: Item) {
    startTransition(async () => {
      if (!(await trashItem(item.id, item.type))) {
        toast.error(`Could not move "${itemTitle(item)}" to the Trash. Try again.`);
        return;
      }
      toast.success(`Moved "${itemTitle(item)}" to the Trash`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              if (!(await restoreItem(item.id))) toast.error(`Could not bring back "${itemTitle(item)}". Try the Trash.`);
            }),
        },
      });
    });
  }

  function submit(formData: FormData) {
    if (!dialog) return;
    const { kind, item } = dialog;
    startTransition(async () => {
      const ok =
        kind === "move"
          ? await moveItemTo(item.id, String(formData.get("folderId") ?? "") || null)
          : await tagItem(item.id, String(formData.get("name") ?? ""));
      if (!ok) {
        toast.error(kind === "move" ? "Could not move the Item. Try again." : "Could not add the Tag. Try again.");
        return;
      }
      setDialog(null);
      toast.success(kind === "move" ? `Moved "${itemTitle(item)}"` : `Tagged "${itemTitle(item)}"`);
    });
  }

  const actions = (item: Item, menu: "dropdown" | "context") => (
    <RowActions
      Entry={menu === "dropdown" ? DropdownMenuItem : ContextMenuItem}
      Separator={menu === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator}
      onOpen={() => router.push(itemHref(item))}
      onOpenNewTab={() => window.open(itemHref(item), "_blank", "noopener")}
      onDialog={(kind) => openDialog(kind, item)}
      onTrash={() => trash(item)}
    />
  );

  const menus: Menus = {
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

  return (
    <>
      {children(menus)}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent
          className="border-border bg-popover sm:max-w-sm"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (lastItem.current) document.getElementById(`actions-${lastItem.current.id}`)?.focus();
          }}
        >
          {dialog && (
            <form action={submit} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>{dialog.kind === "move" ? "Move to Folder" : "Add a Tag"}</DialogTitle>
                <DialogDescription>{itemTitle(dialog.item)}</DialogDescription>
              </DialogHeader>
              {dialog.kind === "move" ? (
                <div className="[&_label]:grid [&_label]:gap-1.5 [&_label]:text-sm [&_label]:font-medium [&_select]:h-9 [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-surface [&_select]:px-2">
                  <FolderSelect name="folderId" label="Folder" folders={folders} selected={dialog.item.folderId} />
                </div>
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
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>
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
