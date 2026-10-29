import { ResetPasswordForm } from "./reset-password-form";

// Reached from the emailed link, which signs the person in; signed-out visitors are sent to /login by proxy.ts.
export default function ResetPasswordPage() {
  return (
    <main className="card">
      <h1>Choose a new password</h1>
      <ResetPasswordForm />
    </main>
  );
}
