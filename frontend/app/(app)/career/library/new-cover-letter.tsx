"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createCoverLetter } from "./actions";

export function NewCoverLetter({ resumes }: { resumes: { id: string; title: string }[] | null }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [resume, setResume] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline">New Cover Letter</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>New Cover Letter</DialogTitle><DialogDescription>Start blank or link a Resume for its sender details and design.</DialogDescription></DialogHeader>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); start(async () => {
        const result = await createCoverLetter(title, resume);
        if (result.ok) { setOpen(false); setTitle(""); setResume(""); setError(""); }
        else setError(result.message);
      }); }}>
        <label className="grid gap-1 text-sm font-medium">Name<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3" /></label>
        {!resumes && <p role="alert">Could not load Resumes. Reload to link one.</p>}
        <label className="grid gap-1 text-sm font-medium">Linked Resume<select value={resume} disabled={!resumes} onChange={(event) => setResume(event.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3">
          <option value="">None</option>{resumes?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create Cover Letter"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
