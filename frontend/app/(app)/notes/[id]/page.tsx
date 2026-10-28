import Link from "next/link";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { FolderSelect } from "../../folders/folder-select";
import { moveItem } from "../../folders/actions";
import { addTag, removeTag } from "../../tags/actions";
import { deleteNote } from "../actions";
import { NoteEditor } from "./note-editor";

export default async function NotePage({ params, searchParams }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const api = await getApi();
  const [result, list, itemTags, allTags] = await Promise.all([
    api.GET("/api/notes/{id}", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/items/{id}/tags", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
  ]);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Another User's Note is a 404 too, and an id that is not a UUID is a 400.
  if (result.response.status === 404 || result.response.status === 400) notFound();
  const note = result.data;
  if (!note) {
    return <p role="alert">Could not load the Note. Try again.</p>;
  }

  const folders = list?.data?.items ?? [];
  const tags = itemTags?.data?.items ?? [];
  const onItem = new Set(tags.map((t) => t.id));
  const suggestions = (allTags?.data?.items ?? []).filter((t) => !onItem.has(t.id));
  const folder = folders.find((f) => f.id === note.folderId);

  return (
    <>
      <p>
        {folder ? <Link href={`/folders/${folder.id}`}>← {folder.name}</Link> : <Link href="/">← All Notes</Link>}
      </p>
      {error === "move" && <p role="alert">Could not move the Note. Try again.</p>}
      {error === "tag" && <p role="alert">Could not add the Tag. Try again.</p>}
      {error === "untag" && <p role="alert">Could not remove the Tag. Try again.</p>}
      <NoteEditor key={note.id} id={note.id} initial={note} />
      <form action={moveItem} className="inline-form">
        <input type="hidden" name="id" value={note.id} />
        <FolderSelect name="folderId" label="Folder" folders={folders} selected={note.folderId} />
        <button type="submit">Move</button>
      </form>
      <section aria-labelledby="tags-heading">
        <h2 id="tags-heading">Tags</h2>
        {tags.length === 0 ? (
          <p>No Tags on this Note.</p>
        ) : (
          <ul className="tag-list">
            {tags.map((tag) => (
              <li key={tag.id}>
                <Link href={`/tags/${tag.id}`}>{tag.name}</Link>
                <form action={removeTag}>
                  <input type="hidden" name="id" value={note.id} />
                  <input type="hidden" name="tagId" value={tag.id} />
                  <button type="submit" aria-label={`Remove the Tag ${tag.name}`}>
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addTag} className="inline-form">
          <input type="hidden" name="id" value={note.id} />
          <label>
            Add a Tag
            <input name="name" list="tag-suggestions" required maxLength={50} autoComplete="off" />
          </label>
          <datalist id="tag-suggestions">
            {suggestions.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          <button type="submit">Add</button>
        </form>
      </section>
      <form action={deleteNote} className="delete-note">
        <input type="hidden" name="id" value={note.id} />
        <button type="submit">Move to Trash</button>
      </form>
    </>
  );
}
