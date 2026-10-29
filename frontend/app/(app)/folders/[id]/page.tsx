import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { childrenByParent, pathTo } from "@/lib/folders";
import { pageInfo } from "@/lib/pages";

import { ItemsView, PAGE_SIZE } from "../../items/items-view";
import { createFolder, deleteFolder, moveFolder, renameFolder } from "../actions";
import { FolderSelect } from "../folder-select";

const errors: Record<string, string> = {
  cycle: "A Folder cannot be moved into itself or one of its own subfolders.",
  move: "Could not move the Folder. Try again.",
  rename: "Could not rename the Folder. Try again.",
  delete: "Could not move the Folder to the Trash. Try again.",
  create: "Could not create the Note. Try again.",
};

export default async function FolderPage({ params, searchParams }: PageProps<"/folders/[id]">) {
  const { id } = await params;
  const { error, page: raw } = await searchParams;
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
      alert={typeof error === "string" ? errors[error] : undefined}
    >
      {/* shortcut: managing a Folder keeps the first UI's forms, restyle them with the Folder screen work. */}
      <section aria-labelledby="manage-heading">
        <h2 id="manage-heading">Manage</h2>
        <form action={createFolder} className="inline-form">
          <input type="hidden" name="parentId" value={id} />
          <label>
            New subfolder
            <input name="name" required maxLength={200} />
          </label>
          <button type="submit">Create</button>
        </form>
        <form action={renameFolder} className="inline-form">
          <input type="hidden" name="id" value={id} />
          <label>
            Name
            <input name="name" required maxLength={200} defaultValue={folder.name} />
          </label>
          <button type="submit">Rename</button>
        </form>
        <form action={moveFolder} className="inline-form">
          <input type="hidden" name="id" value={id} />
          <FolderSelect name="parentId" label="Move into" folders={folders} selected={folder.parentId} skip={id} />
          <button type="submit">Move</button>
        </form>

        <details className="delete-folder">
          <summary>Move to Trash…</summary>
          <p>
            This Folder holds {summary.data.folderCount} {summary.data.folderCount === 1 ? "Folder" : "Folders"} and{" "}
            {summary.data.itemCount} {summary.data.itemCount === 1 ? "Item" : "Items"}. All of them go to the Trash
            together.
          </p>
          <form action={deleteFolder}>
            <input type="hidden" name="id" value={id} />
            {folder.parentId && <input type="hidden" name="parentId" value={folder.parentId} />}
            <button type="submit">Move Folder to Trash</button>
          </form>
        </details>
      </section>
    </ItemsView>
  );
}
