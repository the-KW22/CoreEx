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
import type { Imported } from "@/lib/resume/import";

import { createResume } from "./actions";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

// The library's New Resume button: a name, and blank or with sample content to see how a finished one looks. Or a file
// to import: it is read here, shown for review, and only created when the User confirms.
export function NewResume() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sample, setSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<Imported | null>(null);
  const [reading, setReading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setTitle("");
    setSample(false);
    setError(null);
    setImported(null);
    setImportError(null);
  }

  function close(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true);
    setImportError(null);
    try {
      // Loaded when a file is chosen, so the zip reader is not in the page until it is needed.
      const { readImport } = await import("@/lib/resume/import");
      const result = await readImport(file);
      setTitle(result.name);
      setImported(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "This file could not be read, so nothing was imported.");
    } finally {
      setReading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const result = imported ? await createResume(title, false, imported.document) : await createResume(title, sample);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setOpen(false);
        reset();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FileUserIcon aria-hidden />
          New Resume
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Resume</DialogTitle>
          <DialogDescription>
            {imported
              ? "Check what was read from the file. Nothing is created until you choose Create Resume."
              : "Start with an empty page, with sample content you can replace, or from a file you already have."}
          </DialogDescription>
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
          {imported ? (
            <div className="grid gap-2 text-sm">
              <p>Read from a {imported.format} file.</p>
              <div>
                <h3 className="font-medium">What was read</h3>
                {imported.sections.length ? (
                  <ul className="list-disc pl-5">
                    {imported.sections.map((s) => (
                      <li key={s.title}>
                        {s.title}: {s.count} {s.count === 1 ? "entry" : "entries"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No sections were read. The Resume will start with your basic details.</p>
                )}
              </div>
              {imported.skipped.length > 0 && (
                <div>
                  <h3 className="font-medium">Not imported</h3>
                  <ul className="list-disc pl-5">
                    {imported.skipped.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => reset()}>
                Choose another file
              </Button>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
                Start with sample content
              </label>
              <label className="grid gap-1 border-t border-border pt-3 text-sm font-medium">
                Import a file
                <input
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  disabled={reading}
                  onChange={chooseFile}
                  className="text-sm font-normal file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  A CoreEx JSON export, Reactive Resume JSON, JSON Resume, or a LinkedIn data export (zip).
                </span>
              </label>
              {reading && <p role="status" className="text-sm">Reading the file…</p>}
              {importError && (
                <p role="alert" className="text-sm text-destructive">
                  {importError}
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!reading && (
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create Resume"}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
