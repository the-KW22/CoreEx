import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";

import { ItemsView, PAGE_SIZE } from "../../items/items-view";
import { TagActions } from "../tag-actions";

export default async function TagPage({ params, searchParams }: PageProps<"/tags/[id]">) {
  const { id } = await params;
  const { page: raw } = await searchParams;
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
      titleExtra={<TagActions tag={tag} then="/tags" />}
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
    />
  );
}
