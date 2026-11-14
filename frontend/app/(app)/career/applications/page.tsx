import Link from "next/link";

import { PageGone, Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { stageLabel } from "@/lib/applications";
import { pageInfo } from "@/lib/pages";
import { relativeTime } from "@/lib/time";

import { NewApplication } from "./new-application";

const PAGE_SIZE = 50;

// The Applications screen (docs/DESIGN.md section 6.4a): the User's Applications, newest first. Grouping by Stage,
// sorting by Next step and bulk actions are later tickets.
export default async function ApplicationsPage({ searchParams }: PageProps<"/career/applications">) {
  const { page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const result = await api
    .GET("/api/applications", { params: { query: { page: requested, size: PAGE_SIZE } } })
    .catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load your Applications. Try again.</p>;
  }

  const { items, total } = result.data;
  const page = pageInfo(total, raw, PAGE_SIZE);
  // The API's clock, as Home does: a page render must not read the time itself.
  const now = Date.parse(result.response.headers.get("date") ?? "");

  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Applications</h1>
        <NewApplication />
      </header>

      {total === 0 ? (
        <p className="text-muted-foreground">No Applications yet. Add the first job you are interested in.</p>
      ) : items.length === 0 ? (
        <PageGone first="/career/applications" />
      ) : (
        <ul className="grid gap-2">
          {items.map((application) => (
            <li key={application.id}>
              <Link
                href={`/career/applications/${application.id}`}
                className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-[10px] border border-border px-4 py-3 hover:bg-surface"
              >
                <span className="truncate font-medium" title={application.title}>
                  {application.title}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {stageLabel(application.stage)}
                  {!Number.isNaN(now) && ` · Updated ${relativeTime(application.updatedAt, now)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} href={(n) => (n > 0 ? `/career/applications?page=${n}` : "/career/applications")} />
    </div>
  );
}
