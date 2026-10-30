import { Suspense } from "react";

import { AuthCard } from "@/components/auth-card";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthCard title="Sign in to CoreEx">
      <p className="text-sm text-muted-foreground">
        CoreEx is invite-only. Create an account with the email you were invited with.
      </p>
      {/* The form reads the sign-up link's query string, which needs a Suspense boundary. */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
