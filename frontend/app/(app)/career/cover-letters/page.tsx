import Link from "next/link";

import { getApi } from "@/lib/api/server";

import { NewCoverLetter } from "../library/new-cover-letter";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// The User's Cover Letters (docs/DESIGN.md section 3.4): each with the Application it is for and the Resume it is linked
// to. A letter needs neither. shortcut: a list only, sorted by name, because the API's letters carry no dates and are not
// paged; add Grid and sort by change when it does.
export default async function CoverLettersPage({ searchParams }: PageProps<"/career/cover-letters">) {
  const q = first((await searchParams).q).trim();
  const api = await getApi();
  const [letters, grouped] = await Promise.all([
    api.GET("/api/cover-letters").catch(() => null),
    api.GET("/api/career/documents-by-application").catch(() => null),
  ]);
  // Every Resume and CV, for the "Linked Resume" choice and the names beside each letter, 100 a page.
  const resumes: { id: string; title: string }[] = [];
  let resumesFailed = false;
  for (let number = 0; ; number++) {
    const page = await api.GET("/api/resumes", { params: { query: { page: number, size: 100 } } }).catch(() => null);
    if (!page?.data) {
      resumesFailed = true;
      break;
    }
    resumes.push(...page.data.items);
    if (resumes.length >= page.data.total || page.data.items.length === 0) break;
  }

  if (!letters?.data) return <p role="alert">Could not load your Cover Letters. Try again.</p>;

  const titles = new Map(resumes.map((r) => [r.id, r.title]));
  const apps = new Map(
    (grouped?.data ?? []).filter((d) => d.kind === "COVER_LETTER" && d.itemId).map((d) => [d.itemId!, { id: d.applicationId, title: d.applicationTitle }]),
  );
  const shown = letters.data
    .filter((letter) => letter.title.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
    .toSorted((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Cover Letters</h1>
          <p className="text-sm text-muted-foreground">A letter to one employer. It can be linked to a Resume for its sender details and design.</p>
        </div>
        <NewCoverLetter resumes={resumesFailed ? null : resumes} />
      </header>

      <form action="/career/cover-letters" role="search" className="flex gap-2">
        <label className="grid gap-1 text-sm font-medium">
          Search by title
          <input name="q" type="search" defaultValue={q} maxLength={200} autoComplete="off" className="h-9 w-64 max-w-full rounded-lg border border-border bg-surface px-3 font-normal" />
        </label>
        <button type="submit" className="mt-6 h-9 rounded-lg border border-border px-3 text-sm hover:bg-surface">
          Search
        </button>
      </form>

      {shown.length === 0 ? (
        <p className="text-muted-foreground">{q ? `No Cover Letter has “${q}” in its name.` : "No Cover Letters yet."}</p>
      ) : (
        <ul aria-label="Cover Letters" className="grid gap-2">
          {shown.map((letter) => {
            const app = apps.get(letter.id);
            const resume = letter.linkedResumeId ? titles.get(letter.linkedResumeId) : undefined;
            return (
              <li key={letter.id} className="grid gap-1 rounded-lg border border-border px-4 py-3">
                <Link href={`/career/cover-letters/${letter.id}`} className="truncate font-medium hover:underline">
                  {letter.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {app ? (
                    <>
                      For <Link href={`/career/applications/${app.id}`} className="underline underline-offset-2">{app.title}</Link>
                    </>
                  ) : (
                    "Not linked to an Application"
                  )}
                  {resume && ` · Resume: ${resume}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
