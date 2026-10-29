"use client";

import { FileTextIcon, FolderPlusIcon, ImageIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { TagBadge } from "@/components/tag-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Folder, viewingFolderId } from "@/lib/folders";
import { itemHref } from "@/lib/items";
import { cn } from "@/lib/utils";

import { createFolder } from "./folders/actions";
import { openPalette } from "./search/command-palette";
import { FolderTree } from "./folders/folder-tree";

const viewButton =
  "flex-1 text-muted-foreground data-[state=on]:bg-border data-[state=on]:font-semibold data-[state=on]:text-foreground pointer-coarse:h-11";

type Tag = { id: string; name: string };
type PanelItem = { id: string; type: "NOTE" | "ASSET"; title: string };

const input =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground pointer-coarse:h-11";

// The Items in the Folder being viewed. `undefined` while loading, `null` when the lookup failed.
function FolderItems({ folder }: { folder: Folder }) {
  const [loaded, setLoaded] = useState<{ id: string; items: PanelItem[] | null }>();

  useEffect(() => {
    let current = true;
    fetch(`/folder-items?folderId=${folder.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((items) => current && setLoaded({ id: folder.id, items }));
    return () => {
      current = false;
    };
    // `folder`, not its id: every server refresh (an upload, a move) sends a new object, so the list reloads too.
  }, [folder]);

  const items = loaded?.id === folder.id ? loaded.items : undefined;
  return (
    <section aria-label={`In ${folder.name}`} className="grid gap-1 border-t border-border-subtle pt-3">
      <h3 className="truncate px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">In {folder.name}</h3>
      {items === undefined ? (
        <p className="px-2 text-sm text-muted-foreground">Loading…</p>
      ) : items === null ? (
        <p role="alert" className="px-2 text-sm">Could not load the Items. Try again.</p>
      ) : items.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">No Items here yet.</p>
      ) : (
        <ul className="grid gap-0.5">
          {items.map((item) => {
            const Icon = item.type === "NOTE" ? FileTextIcon : ImageIcon;
            return (
              <li key={item.id}>
                <Link
                  href={itemHref(item)}
                  className="flex min-h-8 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground pointer-coarse:min-h-11"
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{item.title || "Untitled"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function NewFolder() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger
            aria-label="New Folder"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground pointer-coarse:size-11"
          >
            <FolderPlusIcon aria-hidden className="size-4" />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>New Folder</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64">
        <form
          action={async (formData) => {
            await createFolder(formData);
            setOpen(false);
          }}
          className="flex flex-col gap-2"
        >
          <label className="grid gap-1 text-sm font-medium">
            Folder name
            <input name="name" required maxLength={200} autoFocus className={input} />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
            Create Folder
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function KbPanel({ folders, tags }: { folders: Folder[] | null; tags: Tag[] | null }) {
  const pathname = usePathname();
  const [view, setView] = useState(pathname.startsWith("/tags") ? "tags" : "folders");
  const viewing = viewingFolderId(pathname);
  const folder = folders?.find((f) => f.id === viewing);

  return (
    <div className="flex h-full w-72 max-w-full flex-col gap-4 overflow-y-auto border-r border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Knowledge Base</h2>
        <NewFolder />
      </div>

      {/* Looks like a field, opens the command palette. */}
      <button
        type="button"
        onClick={openPalette}
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(input, "flex items-center gap-2 text-left text-muted-foreground")}
      >
        <SearchIcon aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">Search</span>
        <kbd aria-hidden className="rounded border border-border px-1.5 font-mono text-[11px] max-md:hidden">Ctrl K</kbd>
      </button>

      <ToggleGroup
        type="single"
        variant="outline"
        value={view}
        onValueChange={(value) => value && setView(value)}
        aria-label="Show in the panel"
        className="w-full"
      >
        <ToggleGroupItem value="folders" className={viewButton}>Folders</ToggleGroupItem>
        <ToggleGroupItem value="tags" className={viewButton}>Tags</ToggleGroupItem>
      </ToggleGroup>

      {view === "folders" ? (
        <>
          {folders ? (
            folders.length === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">No Folders yet.</p>
            ) : (
              <FolderTree folders={folders} />
            )
          ) : (
            <p role="alert" className="px-2 text-sm">Could not load Folders.</p>
          )}
          {folder && <FolderItems folder={folder} />}
        </>
      ) : tags ? (
        <div className="grid gap-3">
          {tags.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">No Tags yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <Link href={`/tags/${tag.id}`} className="rounded-full">
                    <TagBadge name={tag.name} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/tags" className="px-2 text-sm text-link underline-offset-4 hover:underline">
            Manage Tags
          </Link>
        </div>
      ) : (
        <p role="alert" className="px-2 text-sm">Could not load Tags.</p>
      )}
    </div>
  );
}
