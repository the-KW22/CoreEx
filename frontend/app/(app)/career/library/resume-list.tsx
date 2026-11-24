import Link from "next/link";

import { PageGone, Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { NewResumeFromCv } from "./from-cv";
import { NewResume } from "./new-resume";
import { ResumeRow } from "./resume-row";

const PAGE_SIZE = 24;
const SORTS = [
  { value: "updated", label: "Changed" },
  { value: "name", label: "Name" },
  { value: "created", label: "Created" },
] as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Kind = "RESUME" | "CV";

// The list page of CVs (`/career/cv`) or of Resumes (`/career/resumes`) (docs/DESIGN.md section 3.4): cards with their first
// page, or a list, searched by title and sorted by change, name or creation. A Resume shows the Application it is for.
export async function ResumeList({ kind, searchParams }: { kind: Kind; searchParams: Record<string, string | string[] | undefined> }) {
  const cv = kind === "CV";
  const base = cv ? "/career/cv" : "/career/resumes";
  const word = cv ? "CV" : "Resume";
  const q = first(searchParams.q).trim();
  const sort = SORTS.some((s) => s.value === first(searchParams.sort)) ? first(searchParams.sort) : "updated";
  const view = first(searchParams.view) === "list" ? "list" : "grid";
  const requested = pageInfo(0, first(searchParams.page) || undefined, PAGE_SIZE).page;

  // A link to this page with its own choices kept (search, sort, view); the defaults are left out.
  const link = ({ q, sort, view, page }: { q: string; sort: string; view: string; page?: number }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (sort !== "updated") query.set("sort", sort);
    if (view === "list") query.set("view", "list");
    if (page) query.set("page", String(page));
    return query.size > 0 ? `${base}?${query}` : base;
  };

  const api = await getApi();
  const [result, grouped, cvs] = await Promise.all([
    api.GET("/api/resumes", { params: { query: { page: requested, size: PAGE_SIZE, q, sort, kind } } }).catch(() => null),
    cv ? null : api.GET("/api/career/documents-by-application").catch(() => null),
    // shortcut: the first 100 CVs fill the "New Resume from CV" choice, upgrade to a search box when someone keeps more.
    cv ? null : api.GET("/api/resumes", { params: { query: { size: 100, kind: "CV" } } }).catch(() => null),
  ]);
  if (!result) return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  if (!result.data) return <p role="alert">Could not load your {word}s. Try again.</p>;

  const { items, total, tags } = result.data;
  const page = pageInfo(total, first(searchParams.page) || undefined, PAGE_SIZE);
  // The API's clock, as Home does: a page render must not read the time itself.
  const now = Date.parse(result.response.headers.get("date") ?? "");
  const here = { q, sort, view };
  const apps = new Map(
    (grouped?.data ?? []).filter((d) => d.kind === "RESUME" && d.itemId).map((d) => [d.itemId!, { id: d.applicationId, title: d.applicationTitle }]),
  );
  const pill = (current: boolean) => cn("rounded-lg border border-border px-3 py-1.5 hover:bg-surface", current && "bg-surface font-medium");

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{cv ? "CV" : "Resumes"}</h1>
          <p className="text-sm text-muted-foreground">
            {cv
              ? "Your master document: complete, kept up to date, never sent as it is. Make a Resume from it for each Application."
              : "One for each Application, made from your CV. The version you send stays unchanged."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewResume kind={kind} />
          {!cv && <NewResumeFromCv cvs={(cvs?.data?.items ?? []).map(({ id, title }) => ({ id, title }))} />}
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <form action={base} role="search" className="flex gap-2">
          {sort !== "updated" && <input type="hidden" name="sort" value={sort} />}
          {view === "list" && <input type="hidden" name="view" value="list" />}
          <label className="grid gap-1 text-sm font-medium">
            Search by title
            <input name="q" type="search" defaultValue={q} maxLength={200} autoComplete="off" className="h-9 w-64 max-w-full rounded-lg border border-border bg-surface px-3 font-normal" />
          </label>
          <button type="submit" className="mt-6 h-9 rounded-lg border border-border px-3 text-sm hover:bg-surface">
            Search
          </button>
        </form>
        <nav aria-label="Sort" className="flex gap-2 text-sm">
          {SORTS.map((s) => (
            <Link key={s.value} href={link({ ...here, sort: s.value })} aria-current={sort === s.value ? "page" : undefined} className={pill(sort === s.value)}>
              {s.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="View" className="flex gap-2 text-sm">
          <Link href={link({ ...here, view: "grid" })} aria-current={view === "grid" ? "page" : undefined} className={pill(view === "grid")}>
            Grid
          </Link>
          <Link href={link({ ...here, view: "list" })} aria-current={view === "list" ? "page" : undefined} className={pill(view === "list")}>
            List
          </Link>
        </nav>
      </div>

      {total === 0 && q ? (
        <p className="text-muted-foreground">No {word} has “{q}” in its name.</p>
      ) : total === 0 ? (
        <p className="text-muted-foreground">
          {cv ? "No CV yet. Start a blank one, or one with sample content." : "No Resumes yet. Start a blank one, or make one from your CV."}
        </p>
      ) : items.length === 0 ? (
        <PageGone first={link(here)} />
      ) : (
        <ul className={view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4" : "grid gap-2"} aria-label={cv ? "CVs" : "Resumes"}>
          {items.map((resume) => (
            <ResumeRow
              key={resume.id}
              id={resume.id}
              title={resume.title}
              updatedAt={resume.updatedAt}
              updated={Number.isNaN(now) ? null : relativeTime(resume.updatedAt, now)}
              tags={tags[resume.id] ?? []}
              layout={view}
              kind={kind}
              application={apps.get(resume.id) ?? null}
            />
          ))}
        </ul>
      )}
      <Pager page={page} href={(n) => link({ ...here, page: n > 0 ? n : undefined })} />
    </div>
  );
}
