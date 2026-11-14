"use client";

import { BriefcaseBusinessIcon } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { createApplication } from "./actions";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

// The Applications list's New Application button: paste the posting, name the company and role.
export function NewApplication() {
  const [state, action, pending] = useActionState(createApplication, undefined);

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
          <DialogDescription>Paste the posting and say who the job is with. It starts in Saved.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Company
            <input name="company" required maxLength={90} autoComplete="off" className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Role
            <input name="role" required maxLength={90} autoComplete="off" className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Posting
            <textarea
              name="postingText"
              rows={6}
              maxLength={100000}
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
