import Link from "next/link";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { deleteNote } from "../actions";
import { NoteEditor } from "./note-editor";

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const api = await getApi();
  const result = await api.GET("/api/notes/{id}", { params: { path: { id } } }).catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Another User's Note is a 404 too, and an id that is not a UUID is a 400.
  if (result.response.status === 404 || result.response.status === 400) notFound();
  const note = result.data;
  if (!note) {
    return <p role="alert">Could not load the Note. Try again.</p>;
  }

  return (
    <>
      <p>
        <Link href="/">← All Notes</Link>
      </p>
      <NoteEditor key={note.id} id={note.id} initial={note} />
      <form action={deleteNote} className="delete-note">
        <input type="hidden" name="id" value={note.id} />
        <button type="submit">Move to Trash</button>
      </form>
    </>
  );
}
