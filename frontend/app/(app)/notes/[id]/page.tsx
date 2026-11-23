import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { pathTo } from "@/lib/folders";

import { FolderPicker } from "../../items/folder-picker";
import { ItemBacklinks, ItemConnections, parseDepth } from "../../items/item-sections";
import { ItemMentions, parseMentions } from "../../items/mentions";
import { TagEditor } from "../../items/tag-editor";
import { RecordOpen } from "../../search/record-open";
import { StoryToggle } from "../../career/knowledge/story-toggle";
import { NoteEditor } from "./note-editor";

export default async function NotePage({ params, searchParams }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const { depth: rawDepth, mentions, heading } = await searchParams;
  const depth = parseDepth(rawDepth);
  const api = await getApi();
  const [result, list, itemTags, allTags, stories, waiting, jar] = await Promise.all([
    api.GET("/api/notes/{id}", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/items/{id}/tags", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
    api.GET("/api/knowledge/stories").catch(() => null),
    api.GET("/api/chats/proposals", { params: { query: { noteId: id } } }).catch(() => null),
    cookies(),
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
  const remembered = jar.get("details")?.value;

  return (
    <>
      <RecordOpen id={note.id} />
      <NoteEditor
        key={note.id}
        id={note.id}
        initial={note}
        heading={typeof heading === "string" ? heading : undefined}
        proposals={waiting?.data?.items ?? []}
        crumbs={[
          { href: "/items", label: "All Items" },
          ...(note.folderId ? pathTo(folders, note.folderId) : []).map((f) => ({ href: `/folders/${f.id}`, label: f.name })),
        ]}
        tags={
          itemTags?.data ? (
            <TagEditor itemId={note.id} tags={itemTags.data.items} allTags={allTags?.data?.items ?? []} />
          ) : (
            <p role="alert" className="text-sm">
              Could not load the Tags.
            </p>
          )
        }
        details={
          <div className="grid gap-6">
            <StoryToggle noteId={note.id} isStory={(stories?.data ?? []).some((x) => x.id === note.id)} />
            <FolderPicker itemId={note.id} folderId={note.folderId} folders={folders} />
            <ItemBacklinks itemId={note.id} />
            <ItemMentions itemId={note.id} size={parseMentions(mentions)} depth={depth} />
            <ItemConnections itemId={note.id} type="NOTE" folderId={note.folderId} depth={depth} />
          </div>
        }
        detailsCookie={remembered === "open" || remembered === "closed" ? remembered : null}
      />
    </>
  );
}
