import { PageGone, Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";
import { relativeTime } from "@/lib/time";

import { NewResume } from "./new-resume";
import { ResumeRow } from "./resume-row";

const PAGE_SIZE = 50;
const BASE = "/career/library";

// Resumes & Letters (docs/DESIGN.md section 3.4): the User's Resumes, newest change first. Cover Letters, thumbnails,
// search and grouping by Application come with their own tickets.
export default async function LibraryPage({ searchParams }: PageProps<"/career/library">) {
  const { page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const result = await api
    .GET("/api/resumes", { params: { query: { page: requested, size: PAGE_SIZE } } })
    .catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load your Resumes. Try again.</p>;
  }

  const { items, total } = result.data;
  const page = pageInfo(total, raw, PAGE_SIZE);
  // The API's clock, as Home does: a page render must not read the time itself.
  const now = Date.parse(result.response.headers.get("date") ?? "");

  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Resumes &amp; Letters</h1>
        <NewResume />
      </header>

      {total === 0 ? (
        <p className="text-muted-foreground">No Resumes yet. Start a blank one, or one with sample content.</p>
      ) : items.length === 0 ? (
        <PageGone first={BASE} />
      ) : (
        <ul className="grid gap-2" aria-label="Resumes">
          {items.map((resume) => (
            <ResumeRow
              key={resume.id}
              id={resume.id}
              title={resume.title}
              updated={Number.isNaN(now) ? null : relativeTime(resume.updatedAt, now)}
            />
          ))}
        </ul>
      )}
      <Pager page={page} href={(n) => (n > 0 ? `${BASE}?page=${n}` : BASE)} />
    </div>
  );
}
