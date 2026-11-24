"use client";

import { CopyIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { duplicateResume } from "./actions";

// New Resume from CV: copies a CV (content and design) into a new Resume that is independent of it afterwards.
export function NewResumeFromCv({ cvs }: { cvs: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [cv, setCv] = useState(cvs[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function make(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await duplicateResume(cv);
      if (!result.ok) return setError(result.message);
      toast.success("Made a Resume from the CV");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setError(null); setCv(cvs[0]?.id ?? ""); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={cvs.length === 0} title={cvs.length === 0 ? "Make a CV first" : undefined}>
          <CopyIcon aria-hidden />
          New Resume from CV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Resume from CV</DialogTitle>
          <DialogDescription>Copies the CV, its content and its design, into a new Resume. The copy does not change when the CV does.</DialogDescription>
        </DialogHeader>
        <form onSubmit={make} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            CV
            <select value={cv} onChange={(e) => setCv(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-surface px-3 font-normal">
              {cvs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending || !cv}>
            {pending ? "Making…" : "Make a Resume"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
