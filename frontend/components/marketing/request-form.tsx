"use client";

import { useActionState, useEffect, useRef } from "react";

import { requestAccess } from "@/app/(marketing)/welcome/actions";
import { Alert } from "@/components/alert";
import { authInput } from "@/components/auth-card";
import { Button } from "@/components/ui/button";

// The Request access form of the marketing page. Every "Request access" link on the page points to #request-access;
// following one puts the cursor in the field (without a jump of its own: the link already scrolls there).
export function RequestForm() {
  const [state, action, pending] = useActionState(requestAccess, undefined);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => field.current?.focus({ preventScroll: true });
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest('a[href="#request-access"]')) focus();
    };
    const onHash = () => location.hash === "#request-access" && focus();
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", onHash);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  if (state?.status === "sent") {
    return (
      <Alert role="status" tone="neutral" className="mx-auto mt-8 max-w-md bg-background text-base">
        Thanks. We&apos;ll email you an invite.
      </Alert>
    );
  }

  return (
    <form action={action} className="mx-auto mt-8 grid max-w-md gap-3 text-left">
      <label htmlFor="request-email" className="text-sm font-medium">
        Email
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          ref={field}
          id="request-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          defaultValue={state?.status === "error" ? state.email : ""}
          aria-describedby="request-note"
          className={`${authInput} min-w-0 flex-1`}
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Request access"}
        </Button>
      </div>
      <p id="request-note" className="text-sm text-muted-foreground">
        We only keep your email and the date.
      </p>
      {state?.status === "error" && <Alert>{state.message}</Alert>}
    </form>
  );
}
