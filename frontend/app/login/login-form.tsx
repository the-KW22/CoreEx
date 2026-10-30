"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { Alert } from "@/components/alert";
import { authField, authInput } from "@/components/auth-card";
import { Button } from "@/components/ui/button";

import { authenticate } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(authenticate, undefined);
  // A sign-up link from an Admin looks like /login?email=friend@example.com
  const params = useSearchParams();
  const invitedEmail = params.get("email") ?? "";
  const badLink = params.get("error") === "link";

  // The first submit button in the page's order is what Enter presses, so Sign in must come before "Forgot
  // password?" there. The grid's `order` puts "Forgot password?" beside the Password label all the same.
  return (
    <form action={action} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-4">
      {invitedEmail && (
        <div className="order-1 col-span-2">
          <Alert role="status" tone="neutral">
            You were invited as <strong>{invitedEmail}</strong>. Choose a password and select Create account.
          </Alert>
        </div>
      )}

      <label htmlFor="email" className={`${authField} order-2 col-span-2`}>
        Email
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={invitedEmail}
          required
          className={authInput}
        />
      </label>

      <label htmlFor="password" className="order-3 -mb-2.5 text-sm font-medium">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className={`${authInput} order-4 col-span-2`}
      />

      <div className="order-5 col-span-2 grid gap-4 empty:hidden">
        {badLink && !state && (
          <Alert>
            That link is invalid, has expired, or was opened in a different browser. Enter your email and select Forgot
            password to get a new one.
          </Alert>
        )}
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.notice && <Alert role="status" tone="neutral">{state.notice}</Alert>}
      </div>

      <Button type="submit" name="intent" value="signin" disabled={pending} className="order-6 col-span-2 h-10 w-full">
        Sign in
      </Button>
      <Button
        type="submit"
        name="intent"
        value="signup"
        variant="outline"
        disabled={pending}
        className="order-7 col-span-2 h-10 w-full"
      >
        Create account with your invite
      </Button>
      <button
        type="submit"
        name="intent"
        value="reset"
        formNoValidate
        disabled={pending}
        className="order-3 -mb-2.5 text-sm text-link underline-offset-4 hover:underline"
      >
        Forgot password?
      </button>
    </form>
  );
}
