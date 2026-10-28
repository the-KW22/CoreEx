import { signOut } from "../actions";

export default function DisabledPage() {
  return (
    <main className="card">
      <h1>Your account is disabled</h1>
      <p>You can no longer sign in to CoreEx. Contact the owner if this is a mistake.</p>
      <form action={signOut}>
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
