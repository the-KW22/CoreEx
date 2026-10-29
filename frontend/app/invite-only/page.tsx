import { signOut } from "../actions";

export default function InviteOnlyPage() {
  return (
    <main className="card">
      <h1>CoreEx is invite-only</h1>
      <p>
        This email has no Invite yet. Ask the owner to invite you, then sign in
        again. If you were removed earlier, the owner needs to invite this email
        again too.
      </p>
      <form action={signOut}>
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
