import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { formatBytes } from "@/lib/items";

import { setDisabled, setQuota, useDefaultQuota } from "./actions";

const MIB = 1024 * 1024;

const errors: Record<string, string> = {
  quota: "Could not change the quota. Enter a whole number of megabytes from 0 to about 950,000.",
  status: "Could not change that account. Try again.",
  self: "You cannot disable your own account.",
};

const when = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "Never");

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { error } = await searchParams;
  const api = await getApi();
  const [result, me] = await Promise.all([
    api.GET("/api/admin/users", { params: { query: { size: 100 } } }).catch(() => null),
    api.GET("/api/me").catch(() => null),
  ]);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Not an Admin: the API says so, and the page leads back home.
  if (result.response.status === 403) redirect("/");
  if (!result.data) {
    return <p role="alert">Could not load the Users. Try again.</p>;
  }
  const { items, total } = result.data;

  return (
    <>
      <h1>Users</h1>
      <p>Accounts and how much storage each uses. You see account facts only, never anyone&apos;s Notes or files.</p>
      {typeof error === "string" && errors[error] && <p role="alert">{errors[error]}</p>}

      <table>
        <caption>All Users, newest sign-up first</caption>
        <thead>
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Status</th>
            <th scope="col">Signed up</th>
            <th scope="col">Last active</th>
            <th scope="col">Items</th>
            <th scope="col">Storage used</th>
            <th scope="col">Quota (MB)</th>
            <th scope="col">Account</th>
          </tr>
        </thead>
        <tbody>
          {items.map((user) => {
            const yourself = user.id === me?.data?.id;
            // A quota of 0 with files still stored is full, not empty.
            const percent =
              user.storageQuotaBytes > 0
                ? Math.round((user.storageUsedBytes / user.storageQuotaBytes) * 100)
                : user.storageUsedBytes > 0
                  ? 100
                  : 0;
            return (
              <tr key={user.id}>
                <td>
                  {user.email}
                  {user.role === "ADMIN" && <small> (Admin)</small>}
                  {yourself && <small> (you)</small>}
                </td>
                <td>{user.status === "ACTIVE" ? "Active" : "Disabled"}</td>
                <td>{user.createdAt.slice(0, 10)}</td>
                <td>{when(user.lastActiveAt)}</td>
                <td>{user.itemCount}</td>
                <td>
                  <progress
                    value={user.storageUsedBytes}
                    max={Math.max(user.storageQuotaBytes, 1)}
                    aria-label={`Storage used by ${user.email}`}
                  />
                  <br />
                  <small>
                    {formatBytes(user.storageUsedBytes)} of {formatBytes(user.storageQuotaBytes)} ({percent}%)
                  </small>
                </td>
                <td>
                  <form action={setQuota} className="inline-form">
                    <input type="hidden" name="id" value={user.id} />
                    <input
                      type="number"
                      name="megabytes"
                      min={0}
                      step={1}
                      required
                      defaultValue={Math.round(user.storageQuotaBytes / MIB)}
                      aria-label={`Quota in megabytes for ${user.email}`}
                    />
                    <button type="submit">Save</button>
                  </form>
                  <small>{user.customQuota ? "Custom quota" : "Default quota"}</small>
                  {user.customQuota && (
                    <form action={useDefaultQuota}>
                      <input type="hidden" name="id" value={user.id} />
                      <button type="submit" aria-label={`Use the default quota for ${user.email}`}>
                        Use default
                      </button>
                    </form>
                  )}
                </td>
                <td>
                  {yourself ? (
                    "—"
                  ) : (
                    <form action={setDisabled}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="disable" value={String(user.status === "ACTIVE")} />
                      <button type="submit" aria-label={`${user.status === "ACTIVE" ? "Disable" : "Enable"} ${user.email}`}>
                        {user.status === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* shortcut: shows only the 100 newest Users, add paging controls when there are more. */}
      {total > items.length && (
        <p>
          Showing the newest {items.length} of {total} Users.
        </p>
      )}
    </>
  );
}
