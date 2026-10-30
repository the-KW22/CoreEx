import { redirect } from "next/navigation";

import { PageGone, Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";

import { UsersTable } from "./users-table";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const [result, me] = await Promise.all([
    api.GET("/api/admin/users", { params: { query: { page: requested, size: PAGE_SIZE } } }).catch(() => null),
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
  // The API's clock, as on Home: reading the server's own is not allowed while rendering.
  const now = Date.parse(result.response.headers.get("date") ?? "");

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Accounts and how much storage each uses. You see account facts only, never anyone&apos;s Notes or files.
      </p>
      {items.length === 0 && total > 0 ? (
        <PageGone first="/admin/users" />
      ) : (
        <UsersTable users={items} meId={me?.data?.id} now={Number.isNaN(now) ? null : now} />
      )}
      <Pager page={pageInfo(total, raw, PAGE_SIZE)} href={(n) => (n === 0 ? "/admin/users" : `/admin/users?page=${n}`)} />
    </div>
  );
}
