"use client";

import { BriefcaseBusinessIcon } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { createApplication, readLink } from "./actions";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

// The Applications list's New Application button: give a link and let CoreEx read the page, or paste the posting
// and say who the job is with. Reading a link only fills what is still empty, so typed text is never overwritten.
export function NewApplication() {
  const [state, action, pending] = useActionState(createApplication, undefined);
  const [link, setLink] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [posting, setPosting] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [reading, startReading] = useTransition();

  function read() {
    startReading(async () => {
      const result = await readLink(link.trim());
      if (!result.ok) {
        setNote({ ok: false, text: result.message });
        return;
      }
      const found = result.read;
      const filled: string[] = [];
      if (!company.trim() && found.company) {
        setCompany(found.company);
        filled.push("Company");
      }
      if (!role.trim() && found.role) {
        setRole(found.role);
        filled.push("Role");
      }
      if (!location.trim() && found.location) {
        setLocation(found.location);
        filled.push("Location");
      }
      if (!posting.trim() && found.postingText) {
        setPosting(found.postingText);
        filled.push("Posting");
      }
      const says = filled.length ? `Filled in ${filled.join(", ")}.` : "Nothing new to fill in.";
      setNote({
        ok: true,
        text: `${says} ${found.structured ? "Check them before saving." : "The page had no job data, so check them carefully."}`,
      });
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <BriefcaseBusinessIcon aria-hidden />
          New Application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Application</DialogTitle>
          <DialogDescription>
            Give a link and read the page, or paste the posting and say who the job is with. It starts in Saved.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <div className="grid gap-1 text-sm font-medium">
            <label htmlFor="posting-link">Link to the posting</label>
            <div className="flex gap-2">
              <input
                id="posting-link"
                name="postingUrl"
                type="url"
                inputMode="url"
                maxLength={2000}
                autoComplete="off"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className={input}
              />
              <Button type="button" variant="outline" disabled={reading || !link.trim()} onClick={read}>
                {reading ? "Reading…" : "Read link"}
              </Button>
            </div>
            {note && (
              <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm font-normal text-muted-foreground" : "text-sm font-normal text-destructive"}>
                {note.text}
              </p>
            )}
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Company
            <input
              name="company"
              required
              maxLength={90}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Role
            <input
              name="role"
              required
              maxLength={90}
              autoComplete="off"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Location
            <input
              name="location"
              maxLength={200}
              autoComplete="off"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Posting
            <textarea
              name="postingText"
              rows={6}
              maxLength={100000}
              value={posting}
              onChange={(e) => setPosting(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            Add Application
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
