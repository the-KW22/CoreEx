"use client";

import {
  FilePlusIcon,
  FileTextIcon,
  FileUpIcon,
  ImageIcon,
  SearchIcon,
  XIcon,
  SunMoonIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { toggleTheme } from "@/components/theme-toggle";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { viewingFolderId } from "@/lib/folders";
import { itemHref } from "@/lib/items";

import { ACCEPT_FILES, uploadFiles } from "../assets/upload-files";
import { createNote } from "../notes/actions";
import type { QuickHit } from "./actions";

const OPEN_EVENT = "coreex:open-palette";
// The panel search field and the phone search icon open the palette with this.
export const openPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

// Asks the quick-lookup route: an empty text gives the recently opened Items. A failure is "nothing found".
async function lookup(text: string): Promise<QuickHit[]> {
  try {
    const response = await fetch(`/quick?q=${encodeURIComponent(text)}`);
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

function HitRow({ hit, onSelect }: { hit: QuickHit; onSelect: () => void }) {
  const Icon = hit.type === "NOTE" ? FileTextIcon : ImageIcon;
  return (
    <CommandItem value={hit.id} onSelect={onSelect}>
      <Icon aria-hidden />
      <span className="truncate">{hit.title || "Untitled"}</span>
      {hit.folderPath && <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{hit.folderPath}</span>}
    </CommandItem>
  );
}

// Ctrl+K (Cmd+K on a Mac) on any signed-in page: jump to an Item by title, run an action, or search all text.
export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The answer and the text it answers, so a late answer for older text is never shown.
  const [result, setResult] = useState<{ text: string; hits: QuickHit[] }>();
  const uploadInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => {
      setQuery("");
      setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        // Capture phase, so the editor and the browser do not get the key first.
        event.preventDefault();
        setQuery("");
        setOpen((was) => !was);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  const text = query.trim();
  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = setTimeout(async () => {
      const hits = await lookup(text);
      if (current) setResult({ text, hits });
    }, text ? 150 : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, text]);

  const hits = result?.text === text ? result.hits : undefined;
  const folderId = viewingFolderId(pathname) ?? null;

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setOpen(false);
    const pending = toast.loading(files.length === 1 ? `Adding ${files[0].name}…` : `Adding ${files.length} files…`);
    await uploadFiles(files, folderId, (index, change) => {
      if (change.state === "done" && change.href) {
        const href = change.href;
        toast.success(`Added ${change.label}`, { action: { label: "Open", onClick: () => router.push(href) } });
      } else if (change.state === "failed") {
        toast.error(`${files[index].name}: ${change.message}`);
      }
    });
    toast.dismiss(pending);
    router.refresh();
  }

  const fileInput = (ref: React.RefObject<HTMLInputElement | null>, accept: string, label: string) => (
    <input
      ref={ref}
      type="file"
      multiple
      accept={accept}
      aria-label={label}
      className="hidden"
      onChange={(event) => {
        void upload([...(event.target.files ?? [])]);
        event.target.value = "";
      }}
    />
  );

  return (
    <>
      {/* Outside the Dialog, so they stay mounted while the file picker is open. */}
      {fileInput(uploadInput, ACCEPT_FILES, "Choose files to upload")}
      {fileInput(importInput, ".md,.txt", "Choose Markdown files to import")}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden border-border bg-popover p-0 sm:max-w-xl max-md:inset-0 max-md:h-dvh max-md:max-w-none max-md:translate-0 max-md:rounded-none max-md:border-0"
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Jump to an Item by its title, run an action, or search all text.
          </DialogDescription>
          {/* We ask the API for matches, so cmdk must not filter them again. */}
          <Command shouldFilter={false} className="bg-transparent max-md:h-full">
            <CommandInput
              className="max-md:pr-12"
              value={query}
              onValueChange={setQuery}
              placeholder="Search or jump to…"
              aria-label="Search or jump to an Item"
              maxLength={200}
            />
            <CommandList className="max-h-[min(60vh,28rem)] max-md:max-h-none max-md:flex-1">
              {text ? (
                <>
                  {hits && hits.length > 0 && (
                    <CommandGroup heading="Items">
                      {hits.map((hit) => (
                        <HitRow key={hit.id} hit={hit} onSelect={() => run(() => router.push(itemHref(hit)))} />
                      ))}
                    </CommandGroup>
                  )}
                  {hits?.length === 0 && (
                    <p className="px-4 pt-4 pb-1 text-sm text-muted-foreground">Nothing matches &ldquo;{text}&rdquo;.</p>
                  )}
                  <CommandGroup>
                    <CommandItem
                      value="search-all-text"
                      onSelect={() => run(() => router.push(`/search?q=${encodeURIComponent(text)}`))}
                    >
                      <SearchIcon aria-hidden />
                      <span className="truncate">Search all text for &ldquo;{text}&rdquo;</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : (
                <>
                  {hits && hits.length > 0 && (
                    <CommandGroup heading="Recently opened">
                      {hits.map((hit) => (
                        <HitRow key={hit.id} hit={hit} onSelect={() => run(() => router.push(itemHref(hit)))} />
                      ))}
                    </CommandGroup>
                  )}
                  <CommandGroup heading="Actions">
                    <CommandItem
                      value="new-note"
                      onSelect={() =>
                        run(() => {
                          const form = new FormData();
                          if (folderId) form.append("folderId", folderId);
                          startTransition(() => createNote(form));
                        })
                      }
                    >
                      <FilePlusIcon aria-hidden />
                      New Note
                    </CommandItem>
                    {/* The file picker must open inside the key press or click, so these do not close the palette first. */}
                    <CommandItem value="upload" onSelect={() => uploadInput.current?.click()}>
                      <UploadIcon aria-hidden />
                      Upload files
                    </CommandItem>
                    <CommandItem value="import" onSelect={() => importInput.current?.click()}>
                      <FileUpIcon aria-hidden />
                      Import Markdown
                    </CommandItem>
                    <CommandItem value="trash" onSelect={() => run(() => router.push("/trash"))}>
                      <Trash2Icon aria-hidden />
                      Go to Trash
                    </CommandItem>
                    <CommandItem value="theme" onSelect={() => run(toggleTheme)}>
                      <SunMoonIcon aria-hidden />
                      Toggle theme
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
          {/* Phones have no Escape key. After the list, so opening focuses the search field. */}
          <DialogClose
            aria-label="Close"
            className="absolute top-1 right-1 z-10 grid size-11 place-items-center rounded-lg text-muted-foreground md:hidden"
          >
            <XIcon aria-hidden className="size-5" />
          </DialogClose>
          <p aria-live="polite" className="sr-only">
            {hits && (text ? `${hits.length} ${hits.length === 1 ? "match" : "matches"}` : "")}
          </p>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground max-md:hidden">
            <kbd className="font-mono">↑ ↓</kbd> to move, <kbd className="font-mono">Enter</kbd> to open,{" "}
            <kbd className="font-mono">Esc</kbd> to close
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
