"use client";

import { FolderIcon, LibraryIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { matches } from "@/lib/filter";
import type { Folder } from "@/lib/folders";
import { cn } from "@/lib/utils";

import { FolderTree } from "../folders/folder-tree";
import { ItemCount } from "../folders/item-count";
import { itemLink, panelInput } from "../kb-panel";

// Beside the canvas: All Items and the Folder tree, each opening its graph. Built like the Knowledge Base panel's Folders.
export function GraphFolders({
  folders,
  current,
  href,
}: {
  folders: Folder[];
  current: string | null;
  href: (folderId: string | null) => string;
}) {
  const [text, setText] = useState("");
  const filtering = text.trim() !== "";
  const shown = folders.filter((f) => matches(f.name, text));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <label className="relative block">
        <span className="sr-only">Filter Folders</span>
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Filter Folders"
          className={`${panelInput} pl-9`}
        />
      </label>
      <Link
        href={href(null)}
        aria-current={current === null ? "page" : undefined}
        className={cn(itemLink, current === null && "bg-surface font-semibold text-foreground")}
      >
        <LibraryIcon aria-hidden className="size-4 shrink-0" />
        All Items
      </Link>
      {filtering ? (
        // A match can sit deep in the tree, so a filter shows a flat list.
        shown.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No Folders match.</p>
        ) : (
          <ul aria-label="Folders" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
            {shown.map((f) => (
              <li key={f.id}>
                <Link
                  href={href(f.id)}
                  aria-current={f.id === current ? "page" : undefined}
                  className={cn(itemLink, f.id === current && "bg-surface font-semibold text-foreground")}
                >
                  <FolderIcon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <ItemCount count={f.itemCount} />
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : folders.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">No Folders yet.</p>
      ) : (
        <FolderTree folders={folders} href={href} current={current} />
      )}
    </div>
  );
}
