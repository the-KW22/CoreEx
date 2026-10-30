import { redirect } from "next/navigation";

import { PageGone, Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";

import { InviteForm } from "./invite-form";
import { InvitesTable } from "./invites-table";

const PAGE_SIZE = 50;

// The Invites tab, and the Admin area's home.
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const result = await api
    .GET("/api/admin/invites", { params: { query: { page: requested, size: PAGE_SIZE } } })
    .catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  const { data, response } = result;
  // Not an Admin: the API says so, and the page leads back home.
  if (response.status === 403) redirect("/");
  if (!data) {
    return <p role="alert">Could not load the Invites. Try again.</p>;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          CoreEx is invite-only. Create an Invite, then send the person the sign-up link.
        </p>
        <InviteForm />
      </div>

      {data.total === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No Invites yet.
        </p>
      ) : data.items.length === 0 ? (
        <PageGone first="/admin" />
      ) : (
        <InvitesTable invites={data.items} />
      )}
      <Pager page={pageInfo(data.total, raw, PAGE_SIZE)} href={(n) => (n === 0 ? "/admin" : `/admin?page=${n}`)} />
    </div>
  );
}
