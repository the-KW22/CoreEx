"use client";

import { CheckIcon, FileTextIcon, ImageIcon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { viewingFolderId, type Folder } from "@/lib/folders";
import { formatBytes } from "@/lib/items";
import { activeModule } from "@/lib/modules";
import { cn } from "@/lib/utils";

import { ACCEPT_FILES, type Outcome, uploadFiles } from "./upload-files";

type Kind = "upload" | "import";
type Entry = Outcome & { size: number; type: string };

const OPEN_EVENT = "coreex:open-upload";
// The Upload and Import buttons, Home and the command palette open the dialog with this.
export const openUpload = (kind: Kind) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: kind }));

const isText = (name: string) => /\.(md|txt)$/i.test(name);

// The Upload dialog and the full-window drop overlay (docs/DESIGN.md section 6.5). Files go into the Folder being
// viewed. Uploads carry on with the dialog closed, and each result is also a toast.
export function Uploads({ folders }: { folders: Folder[] | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("upload");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  // How many entries the list holds, kept outside React so batches started close together number theirs right.
  const count = useRef(0);
  const folderId = viewingFolderId(pathname) ?? null;
  const target = folders?.find((f) => f.id === folderId)?.name ?? "the top level";
  const busy = entries.some((e) => e.state === "uploading");

  async function send(files: File[]) {
    if (files.length === 0) return;
    setOpen(true);
    const start = count.current;
    count.current += files.length;
    setEntries((all) => [...all, ...files.map((f) => ({ name: f.name, size: f.size, type: f.type, state: "uploading" as const }))]);
    await uploadFiles(files, folderId, (index, change) => {
      setEntries((all) => all.map((e, i) => (i === start + index ? { ...e, ...change } : e)));
      if (change.state === "done" && change.href) {
        const href = change.href;
        toast.success(`Added ${change.label}`, { action: { label: "Open", onClick: () => router.push(href) } });
      } else if (change.state === "failed") {
        toast.error(`${files[index].name}: ${change.message}`);
      }
    });
    router.refresh();
  }

  // Opening it fresh, with nothing still on its way, starts an empty list.
  useEffect(() => {
    const show = (event: Event) => {
      setKind((event as CustomEvent<Kind>).detail);
      setEntries((all) => {
        if (all.some((e) => e.state === "uploading")) return all;
        count.current = 0;
        return [];
      });
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  // Files dragged anywhere in the Knowledge Base show the overlay; dropping them uploads them.
  const inKnowledgeBase = activeModule(pathname) === "kb" || pathname === "/";
  useEffect(() => {
    if (!inKnowledgeBase) return;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    // Without this the browser opens a dropped file instead of letting the page take it.
    const dragOver = (event: DragEvent) => hasFiles(event) && event.preventDefault();
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      setKind("upload");
      void send([...(event.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", dragOver);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", dragOver);
      window.removeEventListener("drop", drop);
    };
  });

  return (
    <>
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-background/80 p-6 backdrop-blur-sm"
        >
          <div className="grid justify-items-center gap-3 rounded-[18px] border-2 border-dashed border-link px-12 py-10 text-center">
            <UploadIcon aria-hidden className="size-10 text-link" />
            <p className="text-lg font-semibold">Drop to add to {target}</p>
            <p className="text-sm text-muted-foreground">Markdown and text files become Notes; images and PDFs become Assets.</p>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{kind === "import" ? "Import Markdown" : "Upload files"}</DialogTitle>
            <DialogDescription>
              {kind === "import"
                ? `Markdown and text files (up to 1 MB) become Notes in ${target}.`
                : `Images and PDFs (up to 5 MB) become Assets, Markdown and text files become Notes. They go into ${target}.`}
            </DialogDescription>
          </DialogHeader>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            // Handled here, not by the page: the dialog also opens outside the Knowledge Base.
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOver(false);
              depth.current = 0;
              setDragging(false);
              void send([...event.dataTransfer.files]);
            }}
            className={cn(
              "grid justify-items-center gap-3 rounded-[14px] border-2 border-dashed border-border p-8 text-center transition-colors",
              over && "border-link bg-surface",
            )}
          >
            <UploadIcon aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drop files here, or</p>
            <Button type="button" variant="outline" onClick={() => input.current?.click()}>
              Choose files
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={kind === "import" ? ".md,.txt" : ACCEPT_FILES}
              aria-label="Choose files"
              className="hidden"
              onChange={(event) => {
                void send([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </div>

          {entries.length > 0 && (
            <ul aria-label="Files" aria-busy={busy} className="grid max-h-64 gap-2 overflow-y-auto">
              {entries.map((entry, i) => {
                const Icon = isText(entry.name) ? FileTextIcon : ImageIcon;
                return (
                  <li key={i} className="grid gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      {entry.state === "done" && entry.href ? (
                        <Link href={entry.href} onClick={() => setOpen(false)} className="min-w-0 flex-1 truncate hover:underline">
                          {entry.label}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      )}
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatBytes(entry.size)}</span>
                      {entry.state === "done" && <CheckIcon aria-label="Added" className="size-4 shrink-0 text-success" />}
                      {entry.state === "failed" && (
                        <TriangleAlertIcon aria-label="Failed" className="size-4 shrink-0 text-destructive" />
                      )}
                    </div>
                    {entry.state === "uploading" && (
                      <div
                        role="progressbar"
                        aria-label={`Uploading ${entry.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={entry.progress === undefined ? undefined : Math.round(entry.progress * 100)}
                        className="h-1.5 overflow-hidden rounded-full bg-border"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full bg-link transition-[width]",
                            entry.progress === undefined && "w-1/3 animate-pulse",
                          )}
                          style={entry.progress === undefined ? undefined : { width: `${Math.round(entry.progress * 100)}%` }}
                        />
                      </div>
                    )}
                    {entry.state === "failed" && <p className="text-xs text-destructive">{entry.message}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
