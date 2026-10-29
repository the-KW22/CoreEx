import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";

import { ItemsView, PAGE_SIZE } from "../../items/items-view";
import { deleteTag, renameTag } from "../actions";

const errors: Record<string, string> = {
  exists: "You already have a Tag with that name. Pick another name.",
  rename: "Could not rename the Tag. Try again.",
  delete: "Could not delete the Tag. Try again.",
};

export default async function TagPage({ params, searchParams }: PageProps<"/tags/[id]">) {
  const { id } = await params;
  const { error, page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const [list, items, folders] = await Promise.all([
    api.GET("/api/tags").catch(() => null),
    api.GET("/api/items", { params: { query: { tagId: id, page: requested, size: PAGE_SIZE } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
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
    <ItemsView
      crumbs={[{ href: "/tags", label: "Tags" }]}
      title={tag.name}
      folderId={null}
      cards={[]}
      folders={folders?.data?.items ?? []}
      tags={list.data.items}
      items={items.data}
      page={pageInfo(items.data.total, raw, PAGE_SIZE)}
      path={`/tags/${id}`}
      empty="No Items have this Tag yet."
      alert={typeof error === "string" ? errors[error] : undefined}
    >
      {/* shortcut: managing a Tag keeps the first UI's forms, restyle them with the Tags page work (#59). */}
      <section aria-labelledby="manage-heading">
        <h2 id="manage-heading">Manage</h2>
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
      </section>
    </ItemsView>
  );
}
