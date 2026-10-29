import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { formatBytes } from "@/lib/items";

export default async function AdminOverviewPage() {
  const api = await getApi();
  const result = await api.GET("/api/admin/overview").catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Not an Admin: the API says so, and the page leads back home.
  if (result.response.status === 403) redirect("/");
  if (!result.data) {
    return <p role="alert">Could not load the overview. Try again.</p>;
  }
  const { totalUsers, disabledUsers, storageUsedBytes, hostingLimitBytes } = result.data;
  const percent = hostingLimitBytes > 0 ? Math.round((storageUsedBytes / hostingLimitBytes) * 100) : 0;

  return (
    <>
      <h1>Overview</h1>
      <dl className="overview">
        <div>
          <dt>Users</dt>
          <dd>
            {totalUsers}
            {disabledUsers > 0 && <small> ({disabledUsers} disabled)</small>}
          </dd>
        </div>
        <div>
          <dt>Storage used by everyone</dt>
          <dd>
            {formatBytes(storageUsedBytes)} of {formatBytes(hostingLimitBytes)} ({percent}%)
          </dd>
        </div>
      </dl>
      <progress value={storageUsedBytes} max={Math.max(hostingLimitBytes, 1)} aria-label="Total storage used" />
      <p>
        The limit is what the hosting plan allows in total (1 GB on the Supabase free tier). It counts every uploaded
        file, including those still in the Trash, until they are removed for good.
      </p>
      {percent >= 80 && (
        <p role="status">
          Storage is {percent >= 100 ? "full" : "almost full"}. Lower a User&apos;s quota or ask them to empty their
          Trash.
        </p>
      )}
    </>
  );
}
