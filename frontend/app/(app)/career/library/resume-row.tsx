"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { TagBadge } from "@/components/tag-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TagColour } from "@/lib/tag-colour";
import { cn } from "@/lib/utils";

import { restoreItem, trashItem } from "../../items/actions";
import { duplicateResume, renameResume } from "./actions";
import { Thumbnail } from "./thumbnail";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

// One Resume or CV in the library, as a card with its first page (grid) or as a row (list): its name opening the editor, the
// Application a Resume is for, when it changed, its Tags, and Rename, Duplicate (a CV makes a Resume from it) and Move to
// Trash (with Undo).
export function ResumeRow({
  id,
  title,
  updatedAt,
  updated,
  tags,
  layout,
  kind,
  application,
}: {
  id: string;
  title: string;
  updatedAt: string;
  updated: string | null;
  tags: { id: string; name: string; colour?: TagColour | null }[];
  layout: "grid" | "list";
  kind: "RESUME" | "CV";
  /** The Application a Resume is linked to; a CV has none. */
  application?: { id: string; title: string } | null;
}) {
  const cv = kind === "CV";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function rename(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await renameResume(id, name);
      if (result.ok) setOpen(false);
      else setError(result.message);
    });
  }

  function duplicate() {
    start(async () => {
      const result = await duplicateResume(id);
      if (!result.ok) setError(result.message);
    });
  }

  function trash() {
    start(async () => {
      if (!(await trashItem(id, "RESUME"))) return setError("Could not move it to the Trash. Try again.");
      toast.success(`Moved “${title}” to the Trash`, {
        action: {
          label: "Undo",
          onClick: () => void restoreItem(id).then((ok) => !ok && toast.error("Could not bring it back. Try the Trash.")),
        },
      });
    });
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setName(title);
          setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label={`Rename ${title}`}>
            Rename
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cv ? "Rename CV" : "Rename Resume"}</DialogTitle>
            <DialogDescription>The name is only for you; it is not printed on the page.</DialogDescription>
          </DialogHeader>
          <form onSubmit={rename} className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Name
              <input
                name="title"
                required
                maxLength={200}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save name"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={duplicate} aria-label={cv ? `Make a Resume from ${title}` : `Duplicate ${title}`}>
        {cv ? "Make a Resume" : "Duplicate"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={trash} aria-label={`Move to Trash: ${title}`}>
        Move to Trash
      </Button>
    </div>
  );

  const label = (
    <>
      <Link href={`/career/resumes/${id}`} className="block truncate font-medium hover:underline">
        {title}
      </Link>
      {cv ? (
        <p className="text-sm font-medium">CV</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {application ? (
            <>
              For <Link href={`/career/applications/${application.id}`} className="underline underline-offset-2">{application.title}</Link>
            </>
          ) : (
            "Not linked to an Application"
          )}
        </p>
      )}
      {updated && <p className="text-sm text-muted-foreground">Changed {updated}</p>}
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={`Tags of ${title}`}>
          {tags.map((tag) => (
            <li key={tag.id}>
              <TagBadge name={tag.name} colour={tag.colour} />
            </li>
          ))}
        </ul>
      )}
      {error && !open && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );

  return (
    <li className={cn("rounded-lg border border-border", layout === "grid" ? "grid content-start gap-3 p-3" : "flex flex-wrap items-center gap-3 px-4 py-3")}>
      {layout === "grid" && (
        <Link href={`/career/resumes/${id}`} tabIndex={-1} aria-hidden className="block">
          <Thumbnail id={id} updatedAt={updatedAt} title={title} />
        </Link>
      )}
      <div className={cn("grid min-w-0 gap-1", layout === "list" && "flex-1")}>{label}</div>
      {actions}
    </li>
  );
}
