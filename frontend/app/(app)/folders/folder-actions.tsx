"use client";

import { FolderInputIcon, FolderPlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Folder } from "@/lib/folders";

import { FolderSelect } from "./folder-select";
import { createSubfolder, moveFolderTo, renameFolderTo, trashFolder } from "./actions";

const icon = "pointer-coarse:size-11";
const input = "h-9 rounded-lg border border-border bg-surface px-3 font-normal";

// New subfolder, Rename, Move and Move to Trash for the Folder being viewed, beside its title. Each is a Dialog that
// reports with a toast, and Radix puts focus back on the button that opened it.
export function FolderActions({
  folder,
  folders,
  counts,
}: {
  folder: Folder;
  folders: Folder[];
  counts: { folderCount: number; itemCount: number };
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<"create" | "rename" | "move" | null>(null);
  const [cycle, setCycle] = useState(false);

  // One submit for the three form Dialogs: the field to send is read from the form.
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "");
    const parentId = String(data.get("parentId") ?? "") || null;
    setCycle(false);
    startTransition(async () => {
      if (open === "create") {
        if (await createSubfolder(folder.id, name)) {
          setOpen(null);
          toast.success(`Created ${name.trim()}`);
        } else toast.error("Could not create the Folder. Try again.");
      } else if (open === "rename") {
        if (await renameFolderTo(folder.id, name)) {
          setOpen(null);
          toast.success(`Renamed to ${name.trim()}`);
        } else toast.error("Could not rename the Folder. Try again.");
      } else if (open === "move") {
        const result = await moveFolderTo(folder.id, parentId);
        if (result === "ok") {
          setOpen(null);
          toast.success("Moved the Folder");
        } else if (result === "cycle") setCycle(true);
        else toast.error("Could not move the Folder. Try again.");
      }
    });
  };

  const trash = () =>
    startTransition(async () => {
      // On success the action redirects, so only a failure comes back here.
      if (!(await trashFolder(folder.id, folder.parentId))) toast.error("Could not move the Folder to the Trash. Try again.");
    });

  const dialog = (kind: "create" | "rename" | "move", label: string, Icon: typeof PencilIcon, title: string, body: React.ReactNode, action: string) => (
    <Dialog open={open === kind} onOpenChange={(next) => { setOpen(next ? kind : null); setCycle(false); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={icon}>
          <Icon aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{folder.name}</DialogDescription>
          </DialogHeader>
          {body}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex items-center gap-0.5">
      {dialog(
        "create",
        `New subfolder in ${folder.name}`,
        FolderPlusIcon,
        "New subfolder",
        <label className="grid gap-1.5 text-sm font-medium">
          Name
          <input name="name" required maxLength={200} autoComplete="off" autoFocus className={input} />
        </label>,
        "Create",
      )}
      {dialog(
        "rename",
        `Rename ${folder.name}`,
        PencilIcon,
        "Rename Folder",
        <label className="grid gap-1.5 text-sm font-medium">
          Name
          <input name="name" required maxLength={200} autoComplete="off" defaultValue={folder.name} className={input} />
        </label>,
        "Rename",
      )}
      {dialog(
        "move",
        `Move ${folder.name}`,
        FolderInputIcon,
        "Move Folder",
        <div>
          <FolderSelect name="parentId" label="Move into" folders={folders} selected={folder.parentId} skip={folder.id} />
          {cycle && (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              A Folder cannot be moved into itself or one of its own subfolders.
            </p>
          )}
        </div>,
        "Move",
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${folder.name} to Trash`} className={icon}>
            <Trash2Icon aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {folder.name} to the Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This Folder holds {counts.folderCount} {counts.folderCount === 1 ? "Folder" : "Folders"} and {counts.itemCount}{" "}
              {counts.itemCount === 1 ? "Item" : "Items"}. All of them go to the Trash together.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={trash}>
              Move Folder to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
