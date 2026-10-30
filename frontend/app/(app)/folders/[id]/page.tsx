import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { childrenByParent, pathTo } from "@/lib/folders";
import { pageInfo } from "@/lib/pages";

import { ItemsView, PAGE_SIZE } from "../../items/items-view";
import { FolderActions } from "../folder-actions";

export default async function FolderPage({ params, searchParams }: PageProps<"/folders/[id]">) {
  const { id } = await params;
  const { page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const [list, items, summary, tags] = await Promise.all([
    api.GET("/api/folders").catch(() => null),
    api
      .GET("/api/items", { params: { query: { folderId: id, page: requested, size: PAGE_SIZE } } })
      .catch(() => null),
    api.GET("/api/folders/{id}/summary", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
  ]);

  if (!list || !items || !summary) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Missing, deleted, someone else's, or not a UUID: all look the same.
  if ([items, summary].some((r) => r.response.status === 404 || r.response.status === 400)) notFound();
  const folders = list.data?.items;
  if (!folders || !items.data || !summary.data) {
    return <p role="alert">Could not load the Folder. Try again.</p>;
  }
  const path = pathTo(folders, id);
  const folder = path[path.length - 1];
  if (!folder) notFound();

  return (
    <ItemsView
      crumbs={[
        { href: "/items", label: "All Items" },
        ...path.slice(0, -1).map((parent) => ({ href: `/folders/${parent.id}`, label: parent.name })),
      ]}
      title={folder.name}
      folderId={id}
      cards={childrenByParent(folders).get(id) ?? []}
      folders={folders}
      tags={tags?.data?.items ?? []}
      items={items.data}
      page={pageInfo(items.data.total, raw, PAGE_SIZE)}
      path={`/folders/${id}`}
      empty="No Items in this Folder yet."
      titleExtra={<FolderActions folder={folder} folders={folders} counts={summary.data} />}
    />
  );
}
