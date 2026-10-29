"use client";

import { useActionState } from "react";

import { setNewPassword } from "./actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, undefined);

  return (
    <form action={action}>
      <label htmlFor="password">New password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />

      <label htmlFor="confirm">Repeat the new password</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />

      {state?.error && <p role="alert">{state.error}</p>}

      <div className="actions">
        <button type="submit" disabled={pending}>
          Save password
        </button>
      </div>
    </form>
  );
}
