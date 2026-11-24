import { redirect } from "next/navigation";

import { Alert } from "@/components/alert";
import { getApi } from "@/lib/api/server";
import { formatBytes } from "@/lib/items";
import { storageSegments } from "@/lib/storage";

import { ChatCard } from "./chat-card";

// The Overview tab: stats and where the hosting limit's storage goes (docs/DESIGN.md section 6.7).
export default async function AdminOverviewPage() {
  const api = await getApi();
  const [result, users, chat] = await Promise.all([
    api.GET("/api/admin/overview").catch(() => null),
    // shortcut: the chart breaks down the 100 newest Users and lumps the rest into "Others", add an Admin endpoint for per-User totals when there are more.
    api.GET("/api/admin/users", { params: { query: { size: 100 } } }).catch(() => null),
    api.GET("/api/admin/chat-settings").catch(() => null),
  ]);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Not an Admin: the API says so, and the page leads back home.
  if (result.response.status === 403) redirect("/");
  if (!result.data) {
    return <p role="alert">Could not load the overview. Try again.</p>;
  }
  const { totalUsers, disabledUsers, storageUsedBytes, hostingLimitBytes } = result.data;
  const percent =
    hostingLimitBytes > 0 ? Math.round((storageUsedBytes / hostingLimitBytes) * 100) : storageUsedBytes > 0 ? 100 : 0;

  const segments = storageSegments(users?.data?.items ?? [], storageUsedBytes);
  // The bar is the hosting limit; each segment is a share of it. Past the limit the shares are squeezed to fit.
  const scale = Math.max(hostingLimitBytes, storageUsedBytes, 1);

  return (
    <div className="grid gap-6">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <dt className="text-xs font-semibold text-muted-foreground">Users</dt>
          <dd className="mt-1 text-2xl font-semibold">{totalUsers}</dd>
          {disabledUsers > 0 && <dd className="text-xs text-muted-foreground">{disabledUsers} disabled</dd>}
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <dt className="text-xs font-semibold text-muted-foreground">Storage used by everyone</dt>
          <dd className="mt-1 text-2xl font-semibold">{formatBytes(storageUsedBytes)}</dd>
          <dd className="text-xs text-muted-foreground">{percent}% of the limit</dd>
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <dt className="text-xs font-semibold text-muted-foreground">Hosting limit</dt>
          <dd className="mt-1 text-2xl font-semibold">{formatBytes(hostingLimitBytes)}</dd>
        </div>
      </dl>

      {percent >= 80 && (
        <Alert role="status">
          Storage is {percent >= 100 ? "full" : "almost full"}. Lower a User&apos;s quota or ask them to empty their
          Trash.
        </Alert>
      )}

      <section aria-labelledby="storage-heading" className="grid gap-3">
        <h2 id="storage-heading" className="text-sm font-semibold text-muted-foreground">
          Where the storage goes
        </h2>
        {/* Drawn with divs, not a chart library: one stacked bar does not need recharts (docs/DESIGN.md section 7). */}
        <div
          role="img"
          aria-label={`${formatBytes(storageUsedBytes)} of ${formatBytes(hostingLimitBytes)} used, split by User; the list below has the numbers`}
          className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-border"
        >
          {segments.map((s) => (
            <span
              key={s.label}
              data-colour={s.colour}
              className="h-full bg-(--tag)"
              style={{ width: `${(s.bytes / scale) * 100}%` }}
            />
          ))}
        </div>
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files are stored yet.</p>
        ) : (
          <ul className="grid gap-1.5 text-sm">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span data-colour={s.colour} aria-hidden className="size-3 shrink-0 rounded-full bg-(--tag)" />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{formatBytes(s.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          The limit is what the hosting plan allows in total (1 GB on the Supabase free tier). It counts every uploaded
          file, including those still in the Trash, until they are removed for good.
        </p>
      </section>

      {chat?.data && <ChatCard settings={chat.data} />}
    </div>
  );
}
