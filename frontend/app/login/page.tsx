import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="card">
      <h1>Sign in to CoreEx</h1>
      <p>CoreEx is invite-only. Create an account with the email you were invited with.</p>
      {/* The form reads the sign-up link's query string, which needs a Suspense boundary. */}
      <Suspense fallback={<p>Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
