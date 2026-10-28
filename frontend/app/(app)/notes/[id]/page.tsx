import Link from "next/link";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { FolderSelect } from "../../folders/folder-select";
import { moveItem } from "../../folders/actions";
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

  return (
    <>
      <p>
        {folder ? <Link href={`/folders/${folder.id}`}>← {folder.name}</Link> : <Link href="/">← All Notes</Link>}
      </p>
      {error === "move" && <p role="alert">Could not move the Note. Try again.</p>}
      <NoteEditor key={note.id} id={note.id} initial={note} />
      <form action={moveItem} className="inline-form">
        <input type="hidden" name="id" value={note.id} />
        <FolderSelect name="folderId" label="Folder" folders={folders} selected={note.folderId} />
        <button type="submit">Move</button>
      </form>
      <form action={deleteNote} className="delete-note">
        <input type="hidden" name="id" value={note.id} />
        <button type="submit">Move to Trash</button>
      </form>
    </>
  );
}
