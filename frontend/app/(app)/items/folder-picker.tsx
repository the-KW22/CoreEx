"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { flatten, type Folder } from "@/lib/folders";

import { moveItemTo } from "./actions";

// Moves the Item as soon as another Folder is chosen.
export function FolderPicker({ itemId, folderId, folders }: { itemId: string; folderId: string | null; folders: Folder[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="grid gap-1.5 text-xs text-muted-foreground">
      Folder
      <select
        // A new key after a move resets the choice to what the server now says.
        key={folderId ?? ""}
        defaultValue={folderId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const select = event.currentTarget;
          const to = select.value || null;
          startTransition(async () => {
            if (await moveItemTo(itemId, to)) {
              toast.success("Moved");
            } else {
              // Show where it still is, not where it failed to go.
              select.value = folderId ?? "";
              toast.error("Could not move it. Try again.");
            }
          });
        }}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
      >
        <option value="">Top level</option>
        {flatten(folders).map((folder) => (
          <option key={folder.id} value={folder.id}>
            {"  ".repeat(folder.depth)}
            {folder.name}
          </option>
        ))}
      </select>
    </label>
  );
}
