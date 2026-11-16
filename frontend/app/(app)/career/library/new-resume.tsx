"use client";

import { FileUserIcon } from "lucide-react";
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

import { createResume } from "./actions";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

// The library's New Resume button: a name, and blank or with sample content to see how a finished one looks.
export function NewResume() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sample, setSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await createResume(title, sample);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setTitle("");
      setSample(false);
      setError(null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FileUserIcon aria-hidden />
          New Resume
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Resume</DialogTitle>
          <DialogDescription>Start with an empty page, or with sample content you can replace.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Name
            <input
              name="title"
              maxLength={200}
              autoComplete="off"
              placeholder="My Resume"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
            Start with sample content
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create Resume"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
