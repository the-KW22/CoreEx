import { getApi } from "@/lib/api/server";
import { childrenByParent } from "@/lib/folders";
import { parseType } from "@/lib/items";
import { pageInfo } from "@/lib/pages";

import { ItemsView, PAGE_SIZE } from "./items-view";

export default async function AllItemsPage({ searchParams }: PageProps<"/items">) {
  const { page: raw, type: rawType } = await searchParams;
  const type = parseType(rawType);
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const [items, folders, tags] = await Promise.all([
    api.GET("/api/items", { params: { query: { type, page: requested, size: PAGE_SIZE } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/tags").catch(() => null),
  ]);

  if (!items || !folders) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!items.data || !folders.data) {
    return <p role="alert">Could not load your Items. Try again.</p>;
  }

  return (
    <ItemsView
      crumbs={[]}
      title="All Items"
      folderId={null}
      cards={childrenByParent(folders.data.items).get(null) ?? []}
      folders={folders.data.items}
      tags={tags?.data?.items ?? []}
      items={items.data}
      page={pageInfo(items.data.total, raw, PAGE_SIZE)}
      path="/items"
      type={type}
      empty="No Items here yet."
    />
  );
}
