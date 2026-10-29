import Link from "next/link";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { ItemBacklinks, ItemFolder, ItemTags } from "../../items/item-sections";
import { deleteNote } from "../actions";
import { NoteEditor } from "./note-editor";

export default async function NotePage({ params, searchParams }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const api = await getApi();
  const [result, list] = await Promise.all([
    api.GET("/api/notes/{id}", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
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
  const folder = folders.find((f) => f.id === note.folderId);
  const back = `/notes/${note.id}`;

  return (
    <>
      <p>
        {folder ? <Link href={`/folders/${folder.id}`}>← {folder.name}</Link> : <Link href="/">← All Notes</Link>}
      </p>
      {error === "move" && <p role="alert">Could not move the Note. Try again.</p>}
      {error === "tag" && <p role="alert">Could not add the Tag. Try again.</p>}
      {error === "untag" && <p role="alert">Could not remove the Tag. Try again.</p>}
      <NoteEditor key={note.id} id={note.id} initial={note} />
      <ItemFolder itemId={note.id} folderId={note.folderId} folders={folders} back={back} />
      <ItemTags itemId={note.id} back={back} />
      <ItemBacklinks itemId={note.id} />
      <form action={deleteNote} className="delete-note">
        <input type="hidden" name="id" value={note.id} />
        <button type="submit">Move to Trash</button>
      </form>
    </>
  );
}
