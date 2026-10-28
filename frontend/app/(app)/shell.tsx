import Link from "next/link";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { signOut } from "../actions";
import { createFolder } from "./folders/actions";
import { FolderTree } from "./folders/folder-tree";

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

  const folders = await api.GET("/api/folders").catch(() => null);

  return (
    <div className="shell">
      <nav aria-label="Main">
        <strong>CoreEx</strong>
        <ul>
          <li>
            <Link href="/">Notes</Link>
          </li>
          <li>
            <Link href="/tags">Tags</Link>
          </li>
          {/* Only a convenience: the API refuses non-admins on its own (ADR 0004). */}
          {me.role === "ADMIN" && (
            <li>
              <Link href="/admin">Admin</Link>
            </li>
          )}
        </ul>
        <section aria-labelledby="folders-heading">
          <h2 id="folders-heading">Folders</h2>
          {folders?.data ? (
            <FolderTree folders={folders.data.items} />
          ) : (
            <p role="alert">Could not load Folders.</p>
          )}
          <form action={createFolder} className="inline-form">
            <label>
              <span className="visually-hidden">New Folder name</span>
              <input name="name" placeholder="New Folder" required maxLength={200} />
            </label>
            <button type="submit">Add</button>
          </form>
        </section>
        <p>{me.email}</p>
        <form action={signOut}>
          <button type="submit">Log out</button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
