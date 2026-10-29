import Link from "next/link";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { itemHref } from "@/lib/items";

import { deleteTag, renameTag } from "../actions";

const errors: Record<string, string> = {
  exists: "You already have a Tag with that name. Pick another name.",
  rename: "Could not rename the Tag. Try again.",
  delete: "Could not delete the Tag. Try again.",
};

export default async function TagPage({ params, searchParams }: PageProps<"/tags/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const api = await getApi();
  const [list, items] = await Promise.all([
    api.GET("/api/tags").catch(() => null),
    api.GET("/api/items", { params: { query: { tagId: id } } }).catch(() => null),
  ]);

  if (!list || !items) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Missing, someone else's, or not a UUID: all look the same.
  if (items.response.status === 404 || items.response.status === 400) notFound();
  const tag = list.data?.items.find((t) => t.id === id);
  if (!list.data || !items.data) {
    return <p role="alert">Could not load the Tag. Try again.</p>;
  }
  if (!tag) notFound();

  return (
    <>
      <p>
        <Link href="/tags">All Tags</Link>
      </p>
      <h1>{tag.name}</h1>
      {typeof error === "string" && errors[error] && <p role="alert">{errors[error]}</p>}

      {items.data.items.length === 0 ? (
        <p>No Items have this Tag.</p>
      ) : (
        <table>
          <caption>Items with this Tag, most recently updated first</caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={itemHref(item)}>{item.title || "Untitled"}</Link>
                </td>
                <td>{item.updatedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Manage</h2>
      <form action={renameTag} className="inline-form">
        <input type="hidden" name="id" value={id} />
        <label>
          Name
          <input name="name" required maxLength={50} defaultValue={tag.name} />
        </label>
        <button type="submit">Rename</button>
      </form>

      <details className="delete-folder">
        <summary>Delete Tag…</summary>
        <p>
          This removes the Tag from {tag.itemCount} {tag.itemCount === 1 ? "Item" : "Items"}. The Items are kept.
        </p>
        <form action={deleteTag}>
          <input type="hidden" name="id" value={id} />
          <button type="submit">Delete Tag</button>
        </form>
      </details>
    </>
  );
}
