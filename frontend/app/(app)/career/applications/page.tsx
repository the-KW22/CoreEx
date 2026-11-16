import Link from "next/link";

import { PageGone, Pager } from "@/components/pager";
import type { components } from "@/lib/api/schema";
import { getApi, timezoneCookie } from "@/lib/api/server";
import { STAGES, stageLabel } from "@/lib/applications";
import { dayIn, isDate, safeZone } from "@/lib/calendar";
import { insights } from "@/lib/insights";
import { pageInfo } from "@/lib/pages";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { ApplicationsList, type Group } from "./applications-list";
import { Board } from "./board";
import { Calendar } from "./calendar";
import { InsightsView } from "./insights-view";
import { NewApplication } from "./new-application";

const PAGE_SIZE = 50;
// The Board shows a page of this many; shortcut: a long search is paged, not one board, upgrade when someone has 100+.
const BOARD_SIZE = 100;
const BASE = "/career/applications";

type View = "list" | "board" | "calendar" | "insights";

// The title, New Application and the two toggles. Show (All, Needs you) only means something to the list and the board.
function Chrome({ view, needsYou }: { view: View; needsYou: boolean }) {
  const board = view === "board";
  const suffix = board ? "view=board" : "";
  const toggles = [
    ...(view === "calendar" || view === "insights"
      ? []
      : [
          {
            name: "Show",
            links: [
              { label: "All", to: `${BASE}${board ? `?${suffix}` : ""}`, current: !needsYou },
              { label: "Needs you", to: `${BASE}?needs=1${board ? `&${suffix}` : ""}`, current: needsYou },
            ],
          },
        ]),
    {
      name: "View",
      links: [
        { label: "List", to: `${BASE}${needsYou ? "?needs=1" : ""}`, current: view === "list" },
        { label: "Board", to: `${BASE}?${needsYou ? "needs=1&" : ""}view=board`, current: board },
        { label: "Calendar", to: `${BASE}?view=calendar`, current: view === "calendar" },
        { label: "Insights", to: `${BASE}?view=insights`, current: view === "insights" },
      ],
    },
  ];
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Applications</h1>
        <NewApplication />
      </header>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {toggles.map(({ name, links }) => (
          <nav key={name} aria-label={name} className="flex gap-2 text-sm">
            {links.map(({ label, to, current }) => (
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
        ))}
      </div>
    </>
  );
}

// The Applications screen (docs/DESIGN.md section 6.4a): the User's Applications grouped by Stage, each group sorted by
// Next step, with a Needs you filter (?needs=1) that keeps only those due now. Bulk actions are a later ticket.
export default async function ApplicationsPage({ searchParams }: PageProps<"/career/applications">) {
  const { page: raw, needs, view: rawView, month, week, from, to } = await searchParams;
  const view: View =
    rawView === "board" || rawView === "calendar" || rawView === "insights" ? rawView : "list";
  if (view === "calendar") {
    return <CalendarPage month={typeof month === "string" ? month : undefined} week={typeof week === "string" ? week : undefined} />;
  }
  if (view === "insights") {
    return <InsightsPage from={isDate(from) ? from : undefined} to={isDate(to) ? to : undefined} />;
  }
  const needsYou = needs === "1";
  const board = view === "board";
  const size = board ? BOARD_SIZE : PAGE_SIZE;
  const requested = pageInfo(0, raw, size).page;
  const api = await getApi();
  const [result, tags] = await Promise.all([
    api.GET("/api/applications", { params: { query: { page: requested, size, needsYou } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
  ]);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load your Applications. Try again.</p>;
  }

  const { items, total } = result.data;
  const page = pageInfo(total, raw, size);
  // The API's clock, as Home does: a page render must not read the time itself.
  const now = Date.parse(result.response.headers.get("date") ?? "");
  const query = (more: string[] = []) => {
    const all = [needsYou && "needs=1", board && "view=board", ...more].filter(Boolean);
    return all.length ? `?${all.join("&")}` : "";
  };
  const filter = query();
  const href = (n: number) => `${BASE}${query(n > 0 ? [`page=${n}`] : [])}`;
  const groups = items.reduce<Group[]>((all, application) => {
    const row = {
      id: application.id,
      title: application.title,
      next: application.nextStep.label,
      due: application.nextStep.due,
      updated: Number.isNaN(now) ? null : relativeTime(application.updatedAt, now),
      tags: result.data.tags[application.id] ?? [],
    };
    const last = all.at(-1);
    if (last?.stage === application.stage) last.items.push(row);
    else all.push({ stage: application.stage, label: stageLabel(application.stage), items: [row] });
    return all;
  }, []);
  // The Board has a column for every Stage, empty or not.
  const columns = STAGES.map(({ stage, label }) => groups.find((g) => g.stage === stage) ?? { stage, label, items: [] });

  return (
    <div className={cn("mx-auto grid gap-8", board ? "max-w-7xl" : "max-w-5xl")}>
      <Chrome view={view} needsYou={needsYou} />

      {total === 0 && !needsYou ? (
        <p className="text-muted-foreground">No Applications yet. Add the first job you are interested in.</p>
      ) : total === 0 ? (
        <p className="text-muted-foreground">Nothing needs you right now.</p>
      ) : items.length === 0 ? (
        <PageGone first={`${BASE}${filter}`} />
      ) : board ? (
        <Board groups={columns} />
      ) : (
        <ApplicationsList groups={groups} tags={(tags?.data?.items ?? []).map((t) => ({ id: t.id, name: t.name }))} />
      )}
      <Pager page={page} href={href} />
    </div>
  );
}

// shortcut: Calendar and Insights read every page of Applications, upgrade to ranged or summarising API calls when
// someone has hundreds.
async function allApplications() {
  const api = await getApi();
  const applications: components["schemas"]["ApplicationResponse"][] = [];
  let now = NaN;
  for (let page = 0; ; page++) {
    const result = await api.GET("/api/applications", { params: { query: { page, size: 100 } } }).catch(() => null);
    if (!result) return { problem: "Cannot reach the CoreEx API. Is the backend running?" };
    if (!result.data) return { problem: "Could not load your Applications. Try again." };
    // The API's clock, as Home does: a page render must not read the time itself.
    if (page === 0) now = Date.parse(result.response.headers.get("date") ?? "");
    applications.push(...result.data.items);
    if (applications.length >= result.data.total || result.data.items.length === 0) break;
  }
  return { applications, now };
}

async function CalendarPage({ month, week }: { month?: string; week?: string }) {
  const zone = safeZone(await timezoneCookie());
  const loaded = await allApplications();
  if (loaded.problem !== undefined) return <p role="alert">{loaded.problem}</p>;
  const today = dayIn(zone, Number.isNaN(loaded.now) ? new Date(0) : new Date(loaded.now));
  return (
    <div className="mx-auto grid max-w-7xl gap-8">
      <Chrome view="calendar" needsYou={false} />
      <Calendar applications={loaded.applications} zone={zone} today={today} month={month} week={week} />
    </div>
  );
}

async function InsightsPage({ from, to }: { from?: string; to?: string }) {
  const loaded = await allApplications();
  if (loaded.problem !== undefined) return <p role="alert">{loaded.problem}</p>;
  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <Chrome view="insights" needsYou={false} />
      <InsightsView
        insights={insights(loaded.applications, { from, to })}
        range={{ from, to }}
        everApplied={insights(loaded.applications).applied > 0}
      />
    </div>
  );
}
