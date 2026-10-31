import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";

import { ItemsView, PAGE_SIZE } from "../items/items-view";

// Assets are sources (for later RAG, PDF text and image analysis), so they have a page of their own.
export default async function AssetsPage({ searchParams }: PageProps<"/assets">) {
  const { page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const [items, folders, tags] = await Promise.all([
    api.GET("/api/items", { params: { query: { type: "ASSET", page: requested, size: PAGE_SIZE } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/tags").catch(() => null),
  ]);

  if (!items || !folders) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!items.data || !folders.data) {
    return <p role="alert">Could not load your Assets. Try again.</p>;
  }

  return (
    <ItemsView
      crumbs={[]}
      title="Assets"
      folderId={null}
      cards={[]}
      folders={folders.data.items}
      tags={tags?.data?.items ?? []}
      items={items.data}
      page={pageInfo(items.data.total, raw, PAGE_SIZE)}
      path="/assets"
      empty="No Assets yet. Upload an image or a PDF to keep it here."
      assetsOnly
    />
  );
}
