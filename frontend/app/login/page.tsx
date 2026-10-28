import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="card">
      <h1>Sign in to CoreEx</h1>
      <p>CoreEx is invite-only. Create an account with the email you were invited with.</p>
      <LoginForm />
    </main>
  );
}
