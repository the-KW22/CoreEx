import { notFound } from "next/navigation";
import { getApi } from "@/lib/api/server";
import { FolderPicker } from "../../../items/folder-picker";
import { TagEditor } from "../../../items/tag-editor";
import { ItemBacklinks } from "../../../items/item-sections";
import { RecordOpen } from "../../../search/record-open";
import { LetterEditor } from "./letter-editor";
import { DocumentApplications } from "../../document-applications";

export default async function CoverLetterPage({ params }: PageProps<"/career/cover-letters/[id]">) {
  const { id } = await params;
  const api = await getApi();
  const [result, folders, tags, allTags, linked] = await Promise.all([
    api.GET("/api/cover-letters/{id}", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/items/{id}/tags", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
    api.GET("/api/items/{id}/linked-applications", { params: { path: { id } } }).catch(() => null),
  ]);
  if (!result) return <p role="alert">Cannot reach the CoreEx API.</p>;
  if (result.response.status === 404 || result.response.status === 400) notFound();
  if (!result.data) return <p role="alert">Could not load the Cover Letter.</p>;
  return <><RecordOpen id={id} /><LetterEditor initial={result.data} backlinks={<ItemBacklinks itemId={id} />} organise={<>
    <FolderPicker itemId={id} folderId={result.data.folderId} folders={folders?.data?.items ?? []} />
    {linked?.data ? <DocumentApplications id={id} kind="COVER_LETTER" initial={linked.data} /> : <p role="alert">Could not load linked Applications.</p>}
    {tags?.data && <TagEditor itemId={id} tags={tags.data.items} allTags={allTags?.data?.items ?? []} />}
  </>} /></>;
}
