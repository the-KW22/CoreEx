import { FolderIcon, SearchIcon } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/alert";
import { PageGone, Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/server";
import { itemHref, TYPE_LOOK } from "@/lib/items";
import { pageInfo } from "@/lib/pages";
import { relativeTime } from "@/lib/time";

import { FolderSelect } from "../folders/folder-select";

const PAGE_SIZE = 20;

// Shown when the search by meaning could not run (docs/adr/0008): the results are the exact-word ones.
function ExactOnlyNote() {
  return <p className="text-sm text-muted-foreground">Showing exact-word matches only</p>;
}

// A query-string value can be a string or a list; take the first string.
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : (value?.[0] ?? ""));

// The filters are native selects, styled like the Folder picker on the Note screen. A native select is as wide as its
// longest option unless it is told otherwise, so a long Tag name would push it out of its column.
const field =
  "grid grid-cols-[minmax(0,1fr)] gap-1.5 text-sm font-medium [&_select]:h-9 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-surface [&_select]:px-2 [&_select]:font-normal";

// The Search screen (docs/DESIGN.md section 6.10). The command palette's "Search all text" row lands here.
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const type = one(params.type) === "NOTE" ? "NOTE" : one(params.type) === "ASSET" ? "ASSET" : undefined;
  const tagId = one(params.tagId) || undefined;
  const folderId = one(params.folderId) || undefined;
  const page = pageInfo(0, params.page, PAGE_SIZE).page;

  const api = await getApi();
  const [folders, tags, result] = await Promise.all([
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/tags").catch(() => null),
    q
      ? api
          .GET("/api/search", { params: { query: { q, type, tagId, folderId, page, size: PAGE_SIZE } } })
          .catch(() => null)
      : null,
  ]);

  const href = (to: number) => {
    const next = new URLSearchParams({ q });
    if (type) next.set("type", type);
    if (tagId) next.set("tagId", tagId);
    if (folderId) next.set("folderId", folderId);
    if (to > 0) next.set("page", String(to));
    return `/search?${next}`;
  };
  // The API's clock, as on Home: reading the server's own is not allowed while rendering.
  const now = Date.parse(result?.response.headers.get("date") ?? "");

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Search</h1>

      <form action="/search" method="get" role="search" className="grid gap-3">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search for</span>
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={200}
              autoFocus={!q}
              placeholder="Search your Notes, Assets and Tags"
              className="h-10 w-full rounded-lg border border-border bg-surface pr-3 pl-9"
            />
          </label>
          <Button type="submit" className="h-10">
            Search
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={field}>
            Type
            <select name="type" defaultValue={type ?? ""}>
              <option value="">All types</option>
              <option value="NOTE">Notes</option>
              <option value="ASSET">Assets</option>
            </select>
          </label>
          <div className={field}>
            <FolderSelect
              name="folderId"
              label="Folder"
              folders={folders?.data?.items ?? []}
              selected={folderId ?? null}
              emptyLabel="Any Folder"
            />
          </div>
          <label className={field}>
            Tag
            <select name="tagId" defaultValue={tagId ?? ""}>
              <option value="">Any Tag</option>
              {(tags?.data?.items ?? []).map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Words are matched as written, in any language. Use &quot;quotes&quot; for a phrase, <code>or</code> for either
          word, and <code>-word</code> to leave one out. Notes are also found by meaning (English). A Folder includes
          its subfolders.
        </p>
      </form>

      {!q ? (
        <p className="text-muted-foreground">Type something to search your Notes, Assets and Tags.</p>
      ) : !result ? (
        <Alert>
          Cannot reach the CoreEx API. Is the backend running?
        </Alert>
      ) : result.response.status === 404 ? (
        <Alert>
          That Folder or Tag no longer exists. Choose another and search again.
        </Alert>
      ) : !result.data ? (
        <Alert>
          The search failed. Try again.
        </Alert>
      ) : result.data.total === 0 ? (
        <div className="grid gap-1 rounded-[14px] border border-dashed border-border p-8 text-center">
          <p className="font-medium">Nothing matches &quot;{q}&quot;</p>
          <p className="text-sm text-muted-foreground">Try fewer words, or take a filter off.</p>
          {result.data.exactOnly && <ExactOnlyNote />}
        </div>
      ) : result.data.items.length === 0 ? (
        <PageGone first={href(0)} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {result.data.total} {result.data.total === 1 ? "result" : "results"} for &quot;{q}&quot;
          </p>
          {result.data.exactOnly && <ExactOnlyNote />}
          <ol className="grid gap-2">
            {result.data.items.map((hit) => {
              const { Icon, label } = TYPE_LOOK[hit.type];
              return (
                <li
                  key={hit.id}
                  className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-[10px] border border-border px-4 py-3 hover:bg-surface"
                >
                  <Link href={itemHref(hit)} className="flex items-center gap-2 font-medium hover:underline">
                    <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="sr-only">{label}:</span>
                    <span className="truncate" title={hit.title || undefined}>
                      {hit.title || "Untitled"}
                    </span>
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {hit.folderPath && (
                      <span className="flex items-center gap-1">
                        <FolderIcon aria-hidden className="size-3" />
                        {hit.folderPath}
                      </span>
                    )}
                    <time dateTime={hit.updatedAt}>
                      {Number.isNaN(now) ? hit.updatedAt.slice(0, 10) : `Edited ${relativeTime(hit.updatedAt, now)}`}
                    </time>
                  </p>
                  <p className="text-sm">
                    {hit.snippet.map((part, index) =>
                      part.match ? (
                        <mark key={index} className="rounded-sm bg-link/25 px-0.5 text-foreground">
                          {part.text}
                        </mark>
                      ) : (
                        <span key={index}>{part.text}</span>
                      ),
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
          <Pager page={pageInfo(result.data.total, params.page, PAGE_SIZE)} href={href} label="Result pages" />
        </>
      )}
    </div>
  );
}
