"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { recordAction } from "@/lib/chat-context";
import type { Folder } from "@/lib/folders";

import { FolderSelect } from "../folders/folder-select";
import { moveItemTo } from "./actions";

// Moves the Item as soon as another Folder is chosen.
export function FolderPicker({ itemId, kind, title, folderId, folders }: { itemId: string; kind?: "NOTE" | "ASSET"; title?: string; folderId: string | null; folders: Folder[] }) {
  const [pending, startTransition] = useTransition();
  // Bumped when a move fails, so the Select shows where the Item still is, not where it failed to go.
  const [failures, setFailures] = useState(0);
  return (
    <FolderSelect
      // A new key after a move resets the choice to what the server now says.
      key={`${folderId ?? ""}:${failures}`}
      name="folderId"
      label="Folder"
      folders={folders}
      selected={folderId}
      disabled={pending}
      className="text-xs font-normal text-muted-foreground [&_button]:text-sm"
      onChange={(to) =>
        startTransition(async () => {
          if (await moveItemTo(itemId, to)) {
            toast.success("Moved");
            if (title !== undefined) recordAction({ action: "MOVED", kind, id: itemId, title: title || "Untitled" });
          } else {
            setFailures((n) => n + 1);
            toast.error("Could not move it. Try again.");
          }
        })
      }
    />
  );
}
