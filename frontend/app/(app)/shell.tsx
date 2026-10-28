import Link from "next/link";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { signOut } from "../actions";

// Asks the API who is signed in; the API decides whether they may use CoreEx.
export async function Shell({ children }: { children: React.ReactNode }) {
  const api = await getApi();
  const result = await api.GET("/api/me").catch(() => null);

  if (!result) {
    return (
      <p className="card" role="alert">
        Cannot reach the CoreEx API. Is the backend running?
      </p>
    );
  }
  const { data: me, error, response } = result;
  if (response.status === 401) redirect("/login");
  if (response.status === 403) {
    redirect(error?.code === "USER_DISABLED" ? "/disabled" : "/invite-only");
  }
  if (!me) {
    return (
      <p className="card" role="alert">
        Something went wrong loading your account. Try again.
      </p>
    );
  }

  return (
    <div className="shell">
      <nav aria-label="Main">
        <strong>CoreEx</strong>
        <ul>
          <li>Notes</li>
          {/* Only a convenience: the API refuses non-admins on its own (ADR 0004). */}
          {me.role === "ADMIN" && (
            <li>
              <Link href="/admin">Admin</Link>
            </li>
          )}
        </ul>
        <p>{me.email}</p>
        <form action={signOut}>
          <button type="submit">Log out</button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
