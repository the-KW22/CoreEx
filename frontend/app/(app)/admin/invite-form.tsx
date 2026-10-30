"use client";

import { PlusIcon } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { createInvite } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(createInvite, undefined);
  const form = useRef<HTMLFormElement>(null);

  // The new Invite shows up in the list below, so the form just clears.
  useEffect(() => {
    if (state?.created) form.current?.reset();
  }, [state]);

  return (
    <form action={action} ref={form} className="grid gap-2">
      <label htmlFor="invite-email" className="text-sm font-medium">
        Email to invite
      </label>
      <div className="flex gap-2">
        <input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="off"
          required
          aria-describedby={state?.error ? "invite-error" : undefined}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 sm:max-w-sm"
        />
        <Button type="submit" disabled={pending}>
          <PlusIcon aria-hidden />
          Create Invite
        </Button>
      </div>
      {state?.error && (
        <p id="invite-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
