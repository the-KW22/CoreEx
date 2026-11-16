"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { duplicateResume, renameResume } from "./actions";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

// One Resume in the library: its name and when it changed, with Rename and Duplicate. The title becomes a link to the
// editor when the editor exists.
export function ResumeRow({ id, title, updated }: { id: string; title: string; updated: string | null }) {
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

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/career/resumes/${id}`} className="block truncate font-medium hover:underline">
          {title}
        </Link>
        {updated && <p className="text-sm text-muted-foreground">Changed {updated}</p>}
        {error && !open && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
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
            <DialogTitle>Rename Resume</DialogTitle>
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
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={duplicate} aria-label={`Duplicate ${title}`}>
        Duplicate
      </Button>
    </li>
  );
}
