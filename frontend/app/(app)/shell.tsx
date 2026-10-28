import { redirect } from "next/navigation";

import { apiClient } from "@/lib/api/client";
import { createSupabase } from "@/lib/supabase/server";

import { signOut } from "../actions";

// Asks the API who is signed in; the API decides whether they may use CoreEx.
export async function Shell({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabase();
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) redirect("/login");

  const result = await apiClient(auth.session.access_token)
    .GET("/api/me")
    .catch(() => null);

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
