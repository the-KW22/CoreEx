"use client";

import { useActionState } from "react";

import { authenticate } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(authenticate, undefined);

  return (
    <form action={action}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {state?.error && <p role="alert">{state.error}</p>}
      {state?.notice && <p role="status">{state.notice}</p>}

      <div className="actions">
        <button type="submit" name="intent" value="signin" disabled={pending}>
          Sign in
        </button>
        <button type="submit" name="intent" value="signup" disabled={pending}>
          Create account
        </button>
      </div>
    </form>
  );
}
