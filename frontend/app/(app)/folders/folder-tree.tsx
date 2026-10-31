"use client";

import { ChevronRightIcon, FolderIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Folder } from "@/lib/folders";
import { ancestorIds, childrenByParent, viewingFolderId } from "@/lib/folders";
import { cn } from "@/lib/utils";

import { ItemCount } from "./item-count";

const row = "flex min-h-8 items-center gap-2 rounded-lg px-2 text-sm pointer-coarse:min-h-11";

// The panel's tree. A Folder with subfolders collapses; it opens along the path to the Folder being viewed.
export function FolderTree({ folders }: { folders: Folder[] }) {
  const children = childrenByParent(folders);
  const viewing = viewingFolderId(usePathname());
  const opened = new Set(viewing ? [viewing, ...ancestorIds(folders, viewing)] : []);

  const link = (folder: Folder) => (
    <Link
      href={`/folders/${folder.id}`}
      aria-current={folder.id === viewing ? "page" : undefined}
      className={cn(
        row,
        "min-w-0 flex-1 text-muted-foreground hover:bg-surface hover:text-foreground",
        folder.id === viewing && "bg-surface font-semibold text-foreground",
      )}
    >
      <FolderIcon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{folder.name}</span>
      <ItemCount count={folder.itemCount} />
    </Link>
  );

  const list = (parentId: string | null) => (
    <ul className={cn("grid gap-0.5", parentId && "ml-3 border-l border-border-subtle pl-2")}>
      {(children.get(parentId) ?? []).map((folder) => (
        <li key={folder.id}>
          {children.has(folder.id) ? (
            // The key remounts it when the path changes, so navigating into a subfolder opens its parents.
            <Collapsible key={String(opened.has(folder.id))} defaultOpen={opened.has(folder.id)}>
              <div className="flex items-center">
                <CollapsibleTrigger
                  aria-label={`Subfolders of ${folder.name}`}
                  className="group grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground pointer-coarse:size-11"
                >
                  <ChevronRightIcon aria-hidden className="size-4 transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                {link(folder)}
              </div>
              <CollapsibleContent>{list(folder.id)}</CollapsibleContent>
            </Collapsible>
          ) : (
            <div className="flex items-center pl-6 pointer-coarse:pl-11">{link(folder)}</div>
          )}
        </li>
      ))}
    </ul>
  );

  return list(null);
}
