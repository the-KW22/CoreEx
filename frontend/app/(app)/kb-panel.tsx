"use client";

import { FilePlusIcon, FileTextIcon, FolderIcon, FolderPlusIcon, ImageIcon, SearchIcon, TagIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { matches } from "@/lib/filter";
import { type Folder, viewingFolderId } from "@/lib/folders";
import { itemHref } from "@/lib/items";
import { tagColour, type TagColour } from "@/lib/tag-colour";

import { createFolder } from "./folders/actions";
import { FolderTree } from "./folders/folder-tree";
import { createNote } from "./notes/actions";
import { createTag } from "./tags/actions";

const viewButton =
  "flex-1 text-muted-foreground data-[state=on]:bg-border data-[state=on]:font-semibold data-[state=on]:text-foreground pointer-coarse:h-11";

type Tag = { id: string; name: string; colour?: TagColour | null };
type PanelItem = { id: string; type: "NOTE" | "ASSET"; title: string };
type View = "notes" | "folders" | "tags";

export const panelInput =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground pointer-coarse:h-11";
const plusButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground pointer-coarse:size-11";
export const itemLink =
  "flex min-h-8 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground pointer-coarse:min-h-11";

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
                <Link href={itemHref(item)} className={itemLink}>
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

// The Notes tab: the latest Notes, or the ones whose title matches the filter. `refresh` changes with every server
// refresh (a new Note, an import), so the list reloads too.
// shortcut: a rename made while typing shows here after the next refresh, because autosave does not refresh the
// layout (a request per pause in typing); refetch on save if that is ever noticed.
function NotesList({ text, refresh }: { text: string; refresh: unknown }) {
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<{ text: string; notes: { id: string; title: string }[] | null }>();

  useEffect(() => {
    let current = true;
    // Typing waits a moment, so a fast typist asks the server once.
    const timer = setTimeout(
      () => {
        fetch(`/panel-notes?q=${encodeURIComponent(text)}`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
          .then((notes) => current && setLoaded({ text, notes }));
      },
      text ? 200 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, refresh]);

  const notes = loaded?.text === text ? loaded.notes : undefined;
  if (notes === undefined) return <p className="px-2 text-sm text-muted-foreground">Loading…</p>;
  if (notes === null) return <p role="alert" className="px-2 text-sm">Could not load the Notes. Try again.</p>;
  if (notes.length === 0) {
    return <p className="px-2 text-sm text-muted-foreground">{text.trim() ? "No Notes match." : "No Notes yet."}</p>;
  }
  return (
    <ul aria-label="Notes" className="grid gap-0.5">
      {notes.map((note) => (
        <li key={note.id}>
          <Link
            href={itemHref({ id: note.id, type: "NOTE" })}
            aria-current={pathname === `/notes/${note.id}` ? "page" : undefined}
            className={`${itemLink} aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-foreground`}
          >
            <FileTextIcon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{note.title || "Untitled"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// A "+" button that opens a one-field form for a name (a Folder or a Tag). The action answers with a message when it did
// not work; the form stays open then.
function NewName({
  label,
  field,
  max,
  submit,
  icon: Icon,
  action,
}: {
  label: string;
  field: string;
  /** The longest name the API accepts. */
  max: number;
  submit: string;
  icon: typeof FolderPlusIcon;
  action: (formData: FormData) => Promise<string | void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger aria-label={label} className={plusButton}>
            <Icon aria-hidden className="size-4" />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64">
        <form
          action={async (formData) => {
            const problem = await action(formData);
            if (problem) toast.error(problem);
            else setOpen(false);
          }}
          className="flex flex-col gap-2"
        >
          <label className="grid gap-1 text-sm font-medium">
            {field}
            <input name="name" required maxLength={max} autoFocus className={panelInput} />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
            {submit}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function NewNote() {
  return (
    <form action={createNote}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="submit" aria-label="New Note" className={plusButton}>
            <FilePlusIcon aria-hidden className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>New Note</TooltipContent>
      </Tooltip>
    </form>
  );
}

const startView = (pathname: string): View =>
  pathname.startsWith("/tags") ? "tags" : pathname.startsWith("/notes") ? "notes" : "folders";

export function KbPanel({ folders, tags }: { folders: Folder[] | null; tags: Tag[] | null }) {
  const pathname = usePathname();
  const [view, setView] = useState<View>(startView(pathname));
  const [text, setText] = useState("");
  const viewing = viewingFolderId(pathname);
  const folder = folders?.find((f) => f.id === viewing);
  const filtering = text.trim() !== "";

  const shownFolders = folders?.filter((f) => matches(f.name, text));
  const shownTags = tags?.filter((t) => matches(t.name, text));

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Knowledge Base</h2>
        {view === "notes" ? (
          <NewNote />
        ) : view === "folders" ? (
          // createFolder sends the User to Home with a message when it fails, so it never answers one.
          <NewName label="New Folder" field="Folder name" max={200} submit="Create Folder" icon={FolderPlusIcon} action={createFolder} />
        ) : (
          <NewName label="New Tag" field="Tag name" max={50} submit="Create Tag" icon={TagIcon} action={createTag} />
        )}
      </div>

      {/* Filters the list below; Ctrl+K stays the search across everything. */}
      <label className="relative block">
        <span className="sr-only">Filter {view}</span>
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Filter ${view}`}
          className={`${panelInput} pl-9`}
        />
      </label>

      <ToggleGroup
        type="single"
        variant="outline"
        value={view}
        onValueChange={(value) => {
          if (!value) return;
          setView(value as View);
          setText("");
        }}
        aria-label="Show in the panel"
        className="w-full"
      >
        <ToggleGroupItem value="notes" className={viewButton}>Notes</ToggleGroupItem>
        <ToggleGroupItem value="folders" className={viewButton}>Folders</ToggleGroupItem>
        <ToggleGroupItem value="tags" className={viewButton}>Tags</ToggleGroupItem>
      </ToggleGroup>

      {/* Only the list scrolls: the header, filter and tabs stay put, and Manage Tags stays in reach. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {view === "notes" ? (
        <NotesList text={text} refresh={folders} />
      ) : view === "folders" ? (
        <>
          {!shownFolders ? (
            <p role="alert" className="px-2 text-sm">Could not load Folders.</p>
          ) : filtering ? (
            // A match can sit deep in the tree, so a filter shows a flat list.
            shownFolders.length === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">No Folders match.</p>
            ) : (
              <ul aria-label="Folders" className="grid gap-0.5">
                {shownFolders.map((f) => (
                  <li key={f.id}>
                    <Link href={`/folders/${f.id}`} className={itemLink}>
                      <FolderIcon aria-hidden className="size-4 shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : folders?.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">No Folders yet.</p>
          ) : (
            <FolderTree folders={folders ?? []} />
          )}
          {folder && !filtering && <FolderItems folder={folder} />}
        </>
      ) : shownTags ? (
        shownTags.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">{filtering ? "No Tags match." : "No Tags yet."}</p>
        ) : (
          // One Tag a row, in the API's order (by name), instead of a cloud of pills.
          <ul aria-label="Tags" className="grid gap-0.5">
            {shownTags.map((tag) => (
              <li key={tag.id}>
                <Link href={`/tags/${tag.id}`} className={itemLink}>
                  <span aria-hidden data-colour={tag.colour ?? tagColour(tag.name)} className="size-2.5 shrink-0 rounded-full bg-(--tag)" />
                  <span className="truncate">{tag.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p role="alert" className="px-2 text-sm">Could not load Tags.</p>
      )}
      </div>
      {view === "tags" && (
        <Link href="/tags" className="border-t border-border-subtle px-2 pt-3 text-sm text-link underline-offset-4 hover:underline">
          Manage Tags
        </Link>
      )}
    </div>
  );
}
