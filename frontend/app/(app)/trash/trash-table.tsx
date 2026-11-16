"use client";

import { BriefcaseBusinessIcon, FileTextIcon, FileUserIcon, FolderIcon, ImageIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/badge";
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
import type { components } from "@/lib/api/schema";

import { deleteEntryForGood, emptyTrash, restoreEntry, type Removal } from "./actions";

type Entry = components["schemas"]["TrashEntryResponse"];

const kindLabel = { FOLDER: "Folder", NOTE: "Note", ASSET: "Asset", APPLICATION: "Application", RESUME: "Resume" } as const;
const icons = { FOLDER: FolderIcon, NOTE: FileTextIcon, ASSET: ImageIcon, APPLICATION: BriefcaseBusinessIcon, RESUME: FileUserIcon } as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const STORAGE = "File storage is not available right now, so nothing was deleted. Try again in a moment.";
const say = (result: Removal, ok: string, failed: string) => {
  if (result === "ok") toast.success(ok);
  else toast.error(result === "storage" ? STORAGE : failed);
};

// Empty Trash, behind a confirm.
export function EmptyTrash() {
  const [, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2Icon aria-hidden />
          Empty Trash
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Empty the Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes everything in the Trash for good, including files. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => say(await emptyTrash(), "Emptied the Trash", "Could not empty the Trash. Try again."))
            }
          >
            Empty Trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Rows stack on phones, like All Items.
export function TrashTable({ entries }: { entries: Entry[] }) {
  const [pending, startTransition] = useTransition();
  const name = (entry: Entry) => entry.title || "Untitled";

  const restore = (entry: Entry) =>
    startTransition(async () => {
      if (await restoreEntry(entry.kind, entry.id)) toast.success(`Restored "${name(entry)}"`);
      else toast.error(`Could not restore "${name(entry)}". Try again.`);
    });
  const remove = (entry: Entry) =>
    startTransition(async () =>
      say(
        await deleteEntryForGood(entry.kind, entry.id),
        `Deleted "${name(entry)}" for good`,
        `Could not delete "${name(entry)}". Try again.`,
      ),
    );

  return (
    <table className="w-full border-collapse text-sm max-md:block">
      <caption className="sr-only">Most recently deleted first</caption>
      <thead className="text-left text-xs font-medium text-muted-foreground max-md:hidden">
        <tr className="border-b border-border">
          <th scope="col" className="py-2 pr-4 font-medium">Name</th>
          <th scope="col" className="py-2 pr-4 font-medium">Type</th>
          <th scope="col" className="py-2 pr-4 font-medium">Removed for good in</th>
          <th scope="col" className="py-2 font-medium">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="max-md:grid max-md:gap-2">
        {entries.map((entry) => {
          const Icon = icons[entry.kind];
          const soon = entry.daysRemaining <= 3;
          return (
            <tr
              key={entry.id}
              className="border-b border-border-subtle hover:bg-surface max-md:grid max-md:grid-cols-[minmax(0,1fr)] max-md:gap-1 max-md:rounded-[10px] max-md:border max-md:border-border max-md:p-3"
            >
              {/* w-full max-w-0: the name takes the leftover width and truncates, instead of widening the table. */}
              <td className="py-2 pr-4 max-md:p-0 md:w-full md:max-w-0">
                <span className="flex items-center gap-2 font-medium">
                  <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={name(entry)}>
                    {name(entry)}
                  </span>
                </span>
                {entry.kind === "FOLDER" && (entry.folderCount > 0 || entry.itemCount > 0) && (
                  <span className="block pl-6 text-xs text-muted-foreground">
                    with {plural(entry.folderCount, "Folder", "Folders")} and {plural(entry.itemCount, "Item", "Items")}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-muted-foreground max-md:p-0 max-md:pl-6 max-md:text-xs">
                {kindLabel[entry.kind]}
              </td>
              <td className="py-2 pr-4 max-md:p-0 max-md:pl-6">
                {/* The orange Tag colour doubles as the warning colour, so the last days stand out. */}
                <Badge colour={soon ? "orange" : "gray"}>{plural(entry.daysRemaining, "day", "days")} left</Badge>
              </td>
              <td className="py-1 max-md:p-0 max-md:pt-1">
                <div className="flex items-center gap-1 md:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    aria-label={`Restore ${name(entry)}`}
                    onClick={() => restore(entry)}
                  >
                    <RotateCcwIcon aria-hidden />
                    Restore
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete forever: ${name(entry)}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2Icon aria-hidden />
                        Delete forever
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {name(entry)} forever?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes {name(entry)}
                          {entry.kind === "FOLDER" ? " and everything deleted with it" : ""} for good. It cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => remove(entry)}>
                          Delete forever
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
