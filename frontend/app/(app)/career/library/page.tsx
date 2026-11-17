import Link from "next/link";

import { PageGone, Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { NewResume } from "./new-resume";
import { NewCoverLetter } from "./new-cover-letter";
import { ResumeRow } from "./resume-row";

const PAGE_SIZE = 24;
const BASE = "/career/library";
const SORTS = [
  { value: "updated", label: "Changed" },
  { value: "name", label: "Name" },
  { value: "created", label: "Created" },
] as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// A link to the library with the page's own choices kept (search, sort, view); the defaults are left out.
function link({ q, sort, view, group, page }: { q: string; sort: string; view: string; group: string; page?: number }) {
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (sort !== "updated") query.set("sort", sort);
  if (view === "list") query.set("view", "list");
  if (group === "application") query.set("group", "application");
  if (page) query.set("page", String(page));
  return query.size > 0 ? `${BASE}?${query}` : BASE;
}

// Resumes & Letters (docs/DESIGN.md section 3.4): the User's Resumes as cards with their first page, or as a list,
// searched by title and sorted by change, name or creation. Cover Letters and grouping by Application come with their own
// tickets.
export default async function LibraryPage({ searchParams }: PageProps<"/career/library">) {
  const params = await searchParams;
  const q = first(params.q).trim();
  const sort = SORTS.some((s) => s.value === first(params.sort)) ? first(params.sort) : "updated";
  const view = first(params.view) === "list" ? "list" : "grid";
  const group = first(params.group) === "application" ? "application" : "none";
  const requested = pageInfo(0, first(params.page) || undefined, PAGE_SIZE).page;
  const api = await getApi();
  const result = await api
    .GET("/api/resumes", { params: { query: { page: requested, size: PAGE_SIZE, q, sort } } })
    .catch(() => null);
  const letters = await api.GET("/api/cover-letters").catch(() => null);
  const grouped = group === "application" ? await api.GET("/api/career/documents-by-application").catch(() => null) : null;
  const resumeChoices: { id: string; title: string }[] = [];
  let resumeChoicesFailed = false;
  for (let number = 0; ; number++) {
    const page = await api.GET("/api/resumes", { params: { query: { page: number, size: 100 } } }).catch(() => null);
    if (!page?.data) { resumeChoicesFailed = true; break; }
    resumeChoices.push(...page.data.items);
    if (resumeChoices.length >= page.data.total || page.data.items.length === 0) break;
  }

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load your Resumes. Try again.</p>;
  }

  const { items, total, tags } = result.data;
  const page = pageInfo(total, first(params.page) || undefined, PAGE_SIZE);
  // The API's clock, as Home does: a page render must not read the time itself.
  const now = Date.parse(result.response.headers.get("date") ?? "");
  const here = { q, sort, view, group };
  const matches = (title: string) => title.toLocaleLowerCase().includes(q.toLocaleLowerCase());
  const groupedItems = grouped?.data ?? [];
  const linkedIds = new Set(groupedItems.flatMap((item) => item.itemId ? [item.itemId] : []));
  const groups = Map.groupBy(groupedItems.filter((item) => matches(item.documentTitle)), (item) => item.applicationId);
  const unlinked = [...resumeChoices.map((item) => ({ ...item, kind: "RESUME" as const })), ...(letters?.data ?? []).map((item) => ({ id: item.id, title: item.title, kind: "COVER_LETTER" as const }))].filter((item) => !linkedIds.has(item.id) && matches(item.title));
  const pill = (current: boolean) =>
    cn("rounded-lg border border-border px-3 py-1.5 hover:bg-surface", current && "bg-surface font-medium");

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Resumes &amp; Letters</h1>
        <div className="flex flex-wrap gap-2"><NewResume /><NewCoverLetter resumes={resumeChoicesFailed ? null : resumeChoices} /></div>
      </header>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <form action={BASE} role="search" className="flex gap-2">
          {sort !== "updated" && <input type="hidden" name="sort" value={sort} />}
          {view === "list" && <input type="hidden" name="view" value="list" />}
          {group === "application" && <input type="hidden" name="group" value="application" />}
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
        <nav aria-label="Group" className="flex gap-2 text-sm">
          <Link href={link({ ...here, group: "none" })} aria-current={group === "none" ? "page" : undefined} className={pill(group === "none")}>All documents</Link>
          <Link href={link({ ...here, group: "application" })} aria-current={group === "application" ? "page" : undefined} className={pill(group === "application")}>By Application</Link>
        </nav>
      </div>

      {!letters?.data && <p role="alert">Could not load Cover Letters. Try again.</p>}
      {group === "application" ? !grouped?.data || resumeChoicesFailed ? <p role="alert">Could not load grouped documents.</p> : <div className="grid gap-5">
        {[...groups.values()].map((entries) => <section key={entries[0].applicationId} className="grid gap-2">
          <h2 className="text-lg font-semibold"><Link href={`/career/applications/${entries[0].applicationId}`} className="underline underline-offset-2">{entries[0].applicationTitle}</Link></h2>
          <ul className="grid gap-1">{entries.map((item) => <li key={item.kind}>{item.itemId ? <Link href={`${item.kind === "RESUME" ? "/career/resumes" : "/career/cover-letters"}/${item.itemId}`} className="underline underline-offset-2">{item.documentTitle}</Link> : item.documentTitle}{item.sent ? " · Sent" : ""}</li>)}</ul>
        </section>)}
        {unlinked.length > 0 && <section className="grid gap-2"><h2 className="text-lg font-semibold">Not linked to an Application</h2><ul className="grid gap-1">{unlinked.map((item) => <li key={item.id}><Link href={`${item.kind === "RESUME" ? "/career/resumes" : "/career/cover-letters"}/${item.id}`} className="underline underline-offset-2">{item.title}</Link></li>)}</ul></section>}
        {groups.size === 0 && unlinked.length === 0 && <p className="text-muted-foreground">No matching documents.</p>}
      </div> : <>
      {letters?.data && letters.data.some((letter) => matches(letter.title)) && <section aria-labelledby="letters-heading" className="grid gap-2">
        <h2 id="letters-heading" className="text-xl font-semibold">Cover Letters</h2>
        <ul className="grid gap-2">{letters.data.filter((letter) => matches(letter.title)).map((letter) => <li key={letter.id}><Link href={`/career/cover-letters/${letter.id}`} className="underline underline-offset-2">{letter.title}</Link></li>)}</ul>
      </section>}
      {total === 0 && q ? (
        <p className="text-muted-foreground">No Resume has “{q}” in its name.</p>
      ) : total === 0 ? (
        <p className="text-muted-foreground">No Resumes yet. Start a blank one, or one with sample content.</p>
      ) : items.length === 0 ? (
        <PageGone first={link(here)} />
      ) : (
        <ul
          className={view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4" : "grid gap-2"}
          aria-label="Resumes"
        >
          {items.map((resume) => (
            <ResumeRow
              key={resume.id}
              id={resume.id}
              title={resume.title}
              updatedAt={resume.updatedAt}
              updated={Number.isNaN(now) ? null : relativeTime(resume.updatedAt, now)}
              tags={tags[resume.id] ?? []}
              layout={view}
            />
          ))}
        </ul>
      )}
      <Pager page={page} href={(n) => link({ ...here, page: n > 0 ? n : undefined })} />
      </>}
    </div>
  );
}
