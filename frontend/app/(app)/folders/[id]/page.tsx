import Link from "next/link";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { childrenByParent, pathTo } from "@/lib/folders";

import { createNote } from "../../notes/actions";
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
  const { error } = await searchParams;
  const api = await getApi();
  const [list, items, summary] = await Promise.all([
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/items", { params: { query: { folderId: id } } }).catch(() => null),
    api.GET("/api/folders/{id}/summary", { params: { path: { id } } }).catch(() => null),
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
  const subfolders = childrenByParent(folders).get(id) ?? [];

  return (
    <>
      <p>
        <Link href="/">All Notes</Link>
        {path.slice(0, -1).map((parent) => (
          <span key={parent.id}>
            {" / "}
            <Link href={`/folders/${parent.id}`}>{parent.name}</Link>
          </span>
        ))}
      </p>
      <h1>{folder.name}</h1>
      {typeof error === "string" && errors[error] && <p role="alert">{errors[error]}</p>}

      <div className="actions">
        <form action={createNote}>
          <input type="hidden" name="folderId" value={id} />
          <button type="submit">New Note here</button>
        </form>
      </div>

      <h2>Subfolders</h2>
      {subfolders.length === 0 ? (
        <p>No subfolders.</p>
      ) : (
        <ul>
          {subfolders.map((child) => (
            <li key={child.id}>
              <Link href={`/folders/${child.id}`}>{child.name}</Link>
            </li>
          ))}
        </ul>
      )}
      <form action={createFolder} className="inline-form">
        <input type="hidden" name="parentId" value={id} />
        <label>
          New subfolder
          <input name="name" required maxLength={200} />
        </label>
        <button type="submit">Create</button>
      </form>

      {items.data.items.length === 0 ? (
        <p>No Items in this Folder.</p>
      ) : (
        <table>
          <caption>Items in this Folder, most recently updated first</caption>
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
                  <Link href={`/notes/${item.id}`}>{item.title || "Untitled"}</Link>
                </td>
                <td>{item.updatedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Manage</h2>
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
          <button type="submit">Move Folder to Trash</button>
        </form>
      </details>
    </>
  );
}
