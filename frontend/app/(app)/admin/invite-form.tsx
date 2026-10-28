"use client";

import { useActionState, useEffect, useRef } from "react";

import { createInvite } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(createInvite, undefined);
  const form = useRef<HTMLFormElement>(null);

  // The new Invite shows up in the list below, so the form just clears.
  useEffect(() => {
    if (state?.created) form.current?.reset();
  }, [state]);

  return (
    <form action={action} ref={form}>
      <label htmlFor="invite-email">Email to invite</label>
      <input
        id="invite-email"
        name="email"
        type="email"
        autoComplete="off"
        required
      />
      {state?.error && <p role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>
          Create Invite
        </button>
      </div>
    </form>
  );
}
