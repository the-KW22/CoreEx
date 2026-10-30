import { AuthCard } from "@/components/auth-card";

import { ResetPasswordForm } from "./reset-password-form";

// Reached from the emailed link, which signs the person in; signed-out visitors are sent to /login by proxy.ts.
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm />
    </AuthCard>
  );
}
