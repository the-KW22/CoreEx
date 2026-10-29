import Link from "next/link";

import { getApi } from "@/lib/api/server";
import { itemHref } from "@/lib/items";

import { FolderSelect } from "../folders/folder-select";

const PAGE_SIZE = 20;

// A query-string value can be a string or a list; take the first string.
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : (value?.[0] ?? ""));

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const type = one(params.type) === "NOTE" ? "NOTE" : one(params.type) === "ASSET" ? "ASSET" : undefined;
  const tagId = one(params.tagId) || undefined;
  const folderId = one(params.folderId) || undefined;
  const page = Math.max(0, Number.parseInt(one(params.page), 10) || 0);

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

  const link = (to: number) => {
    const next = new URLSearchParams({ q });
    if (type) next.set("type", type);
    if (tagId) next.set("tagId", tagId);
    if (folderId) next.set("folderId", folderId);
    if (to > 0) next.set("page", String(to));
    return `/search?${next}`;
  };

  return (
    <>
      <h1>Search</h1>
      <form action="/search" method="get" className="inline-form" role="search">
        <label>
          Search for
          <input type="search" name="q" defaultValue={q} maxLength={200} autoFocus={!q} />
        </label>
        <label>
          Type
          <select name="type" defaultValue={type ?? ""}>
            <option value="">All types</option>
            <option value="NOTE">Notes</option>
            <option value="ASSET">Assets</option>
          </select>
        </label>
        <FolderSelect
          name="folderId"
          label="Folder"
          folders={folders?.data?.items ?? []}
          selected={folderId ?? null}
          emptyLabel="Any Folder"
        />
        <label>
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
        <button type="submit">Search</button>
      </form>
      <p className="upload-hint">
        Words are matched as written, in any language. Use &quot;quotes&quot; for a phrase, <code>or</code> for either
        word, and <code>-word</code> to leave one out. A Folder includes its subfolders.
      </p>

      {!q ? (
        <p>Type something to search your Notes, Assets and Tags.</p>
      ) : !result ? (
        <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>
      ) : result.response.status === 404 ? (
        <p role="alert">That Folder or Tag no longer exists. Choose another and search again.</p>
      ) : !result.data ? (
        <p role="alert">The search failed. Try again.</p>
      ) : result.data.items.length === 0 ? (
        <p>Nothing matches &quot;{q}&quot;.</p>
      ) : (
        <>
          <p>
            {result.data.total} {result.data.total === 1 ? "result" : "results"}
          </p>
          <ol className="search-results">
            {result.data.items.map((hit) => (
              <li key={hit.id}>
                <Link href={itemHref(hit)}>{hit.title || "Untitled"}</Link>
                <small>
                  {" "}
                  {hit.type === "NOTE" ? "Note" : "Asset"}
                  {hit.folderPath ? ` · ${hit.folderPath}` : ""} · {hit.updatedAt.slice(0, 10)}
                </small>
                <p>
                  {hit.snippet.map((part, index) =>
                    part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
                  )}
                </p>
              </li>
            ))}
          </ol>
          <nav aria-label="Result pages" className="actions">
            {page > 0 && <Link href={link(page - 1)}>← Previous</Link>}
            {(page + 1) * PAGE_SIZE < result.data.total && <Link href={link(page + 1)}>Next →</Link>}
          </nav>
        </>
      )}
    </>
  );
}
