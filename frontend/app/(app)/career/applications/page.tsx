import Link from "next/link";

import { PageGone, Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { stageLabel } from "@/lib/applications";
import { pageInfo } from "@/lib/pages";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { NewApplication } from "./new-application";

const PAGE_SIZE = 50;
const BASE = "/career/applications";

// The Applications screen (docs/DESIGN.md section 6.4a): the User's Applications grouped by Stage, each group sorted by
// Next step, with a Needs you filter (?needs=1) that keeps only those due now. Bulk actions are a later ticket.
export default async function ApplicationsPage({ searchParams }: PageProps<"/career/applications">) {
  const { page: raw, needs } = await searchParams;
  const needsYou = needs === "1";
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const result = await api
    .GET("/api/applications", { params: { query: { page: requested, size: PAGE_SIZE, needsYou } } })
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
  const filter = needsYou ? "?needs=1" : "";
  const href = (n: number) => (n > 0 ? `${BASE}?${needsYou ? "needs=1&" : ""}page=${n}` : `${BASE}${filter}`);
  const groups = items.reduce<{ stage: (typeof items)[number]["stage"]; items: typeof items }[]>((all, application) => {
    const last = all.at(-1);
    if (last?.stage === application.stage) last.items.push(application);
    else all.push({ stage: application.stage, items: [application] });
    return all;
  }, []);

  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Applications</h1>
        <NewApplication />
      </header>

      <nav aria-label="Show" className="flex gap-2 text-sm">
        {[
          { label: "All", to: BASE, current: !needsYou },
          { label: "Needs you", to: `${BASE}?needs=1`, current: needsYou },
        ].map(({ label, to, current }) => (
          <Link
            key={label}
            href={to}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5 hover:bg-surface",
              current && "bg-surface font-medium",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {total === 0 && !needsYou ? (
        <p className="text-muted-foreground">No Applications yet. Add the first job you are interested in.</p>
      ) : total === 0 ? (
        <p className="text-muted-foreground">Nothing needs you right now.</p>
      ) : items.length === 0 ? (
        <PageGone first={`${BASE}${filter}`} />
      ) : (
        groups.map((group) => (
          <section key={group.stage} aria-labelledby={`stage-${group.stage}`} className="grid gap-2">
            <h2 id={`stage-${group.stage}`} className="text-sm font-medium text-muted-foreground">
              {stageLabel(group.stage)}
            </h2>
            <ul className="grid gap-2">
              {group.items.map((application) => (
                <li key={application.id}>
                  <Link
                    href={`${BASE}/${application.id}`}
                    className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-[10px] border border-border px-4 py-3 hover:bg-surface"
                  >
                    <span className="truncate font-medium" title={application.title}>
                      {application.title}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      <span className={cn(application.nextStep.due && "font-medium text-foreground")}>
                        {application.nextStep.due ? `Needs you: ${application.nextStep.label}` : application.nextStep.label}
                      </span>
                      {!Number.isNaN(now) && ` · Updated ${relativeTime(application.updatedAt, now)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <Pager page={page} href={href} />
    </div>
  );
}
