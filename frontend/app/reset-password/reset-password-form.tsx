"use client";

import { useActionState } from "react";

import { AuthMessage, authField, authInput } from "@/components/auth-card";
import { Button } from "@/components/ui/button";

import { setNewPassword } from "./actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, undefined);

  return (
    <form action={action} className="grid gap-4">
      <label htmlFor="password" className={authField}>
        New password
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={authInput}
        />
      </label>

      <label htmlFor="confirm" className={authField}>
        Repeat the new password
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={authInput}
        />
      </label>

      {state?.error && <AuthMessage kind="alert">{state.error}</AuthMessage>}

      <Button type="submit" disabled={pending} className="h-10 w-full">
        Save password
      </Button>
    </form>
  );
}
