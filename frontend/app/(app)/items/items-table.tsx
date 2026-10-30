"use client";

import { FileTextIcon, FileUpIcon, ImageIcon, MoreHorizontalIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
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

import { FolderSelect } from "../folders/folder-select";
import { openUpload } from "../assets/uploads";
import { moveItemTo, restoreItem, tagItem, trashItem } from "./actions";

type Item = components["schemas"]["ItemResponse"];
type Dialogs = { kind: "move" | "tag"; item: Item } | null;

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

// The same four actions in the row's "⋯" menu and its right-click menu; `Entry` and `Separator` are the menu's parts.
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
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, startTransition] = useTransition();
  const folderNames = new Map(folders.map((f) => [f.id, f.name]));
  const title = (item: Item) => item.title || "Untitled";

  // The row a Dialog was for, kept past its closing: focus goes back to that row's "⋯" button, as the menu item that
  // opened the Dialog is gone.
  const lastRow = useRef<Item>(null);
  const openDialog = (kind: "move" | "tag", item: Item) => {
    lastRow.current = item;
    setDialog({ kind, item });
  };

  function trash(item: Item) {
    startTransition(async () => {
      if (!(await trashItem(item.id, item.type))) {
        toast.error(`Could not move "${title(item)}" to the Trash. Try again.`);
        return;
      }
      toast.success(`Moved "${title(item)}" to the Trash`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              if (!(await restoreItem(item.id))) toast.error(`Could not bring back "${title(item)}". Try the Trash.`);
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
      toast.success(kind === "move" ? `Moved "${title(item)}"` : `Tagged "${title(item)}"`);
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

  return (
    <>
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
                        <span className="truncate">{title(item)}</span>
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground max-md:col-start-1 max-md:p-0 max-md:pl-6 max-md:text-xs">
                      {item.folderId ? (folderNames.get(item.folderId) ?? "") : "Top level"}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground max-md:col-start-1 max-md:p-0 max-md:pl-6 max-md:text-xs">
                      <time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time>
                    </td>
                    <td className="py-1 text-right max-md:col-start-2 max-md:row-span-3 max-md:row-start-1 max-md:self-center max-md:p-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          id={`actions-${item.id}`}
                          aria-label={`Actions for ${title(item)}`}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground pointer-coarse:size-11"
                        >
                          <MoreHorizontalIcon aria-hidden className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          {actions(item, "dropdown")}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-44">{actions(item, "context")}</ContextMenuContent>
              </ContextMenu>
            );
          })}
        </tbody>
      </table>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent
          className="border-border bg-popover sm:max-w-sm"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (lastRow.current) document.getElementById(`actions-${lastRow.current.id}`)?.focus();
          }}
        >
          {dialog && (
            <form action={submit} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>{dialog.kind === "move" ? "Move to Folder" : "Add a Tag"}</DialogTitle>
                <DialogDescription>{title(dialog.item)}</DialogDescription>
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
