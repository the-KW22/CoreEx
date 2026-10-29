import Link from "next/link";
import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { formatBytes } from "@/lib/items";

import { ItemBacklinks, ItemFolder, ItemTags } from "../../items/item-sections";
import { deleteAsset, updateAsset } from "../actions";

const errors: Record<string, string> = {
  update: "Could not save the changes. Try again.",
  delete: "Could not move the Asset to the Trash. Try again.",
  move: "Could not move the Asset. Try again.",
  tag: "Could not add the Tag. Try again.",
  untag: "Could not remove the Tag. Try again.",
};

export default async function AssetPage({ params, searchParams }: PageProps<"/assets/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const api = await getApi();
  const [result, list, view, download] = await Promise.all([
    api.GET("/api/assets/{id}", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/assets/{id}/url", { params: { path: { id } } }).catch(() => null),
    api
      .GET("/api/assets/{id}/url", { params: { path: { id }, query: { download: true } } })
      .catch(() => null),
  ]);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Another User's Asset is a 404 too, and an id that is not a UUID is a 400.
  if (result.response.status === 404 || result.response.status === 400) notFound();
  const asset = result.data;
  if (!asset) {
    return <p role="alert">Could not load the Asset. Try again.</p>;
  }

  const folders = list?.data?.items ?? [];
  const folder = folders.find((f) => f.id === asset.folderId);
  const back = `/assets/${asset.id}`;
  const viewUrl = view?.data?.url;
  const isPdf = asset.mimeType === "application/pdf";

  return (
    <>
      <p>
        {folder ? <Link href={`/folders/${folder.id}`}>← {folder.name}</Link> : <Link href="/">← All Notes</Link>}
      </p>
      <h1>{asset.title}</h1>
      {typeof error === "string" && errors[error] && <p role="alert">{errors[error]}</p>}
      <p>
        {isPdf ? "PDF" : "Image"} · {formatBytes(asset.sizeBytes)}
        {download?.data && (
          <>
            {" · "}
            <a href={download.data.url}>Download</a>
          </>
        )}
      </p>

      {!viewUrl ? (
        <p role="alert">The file cannot be shown right now: file storage is not available. Try again in a moment.</p>
      ) : isPdf ? (
        <iframe className="asset-pdf" src={viewUrl} title={`PDF: ${asset.title}`} />
      ) : (
        // A plain <img>: the URL is a short-lived signed link to another origin, so Next's image
        // optimizer cannot cache or resize it.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="asset-image" src={viewUrl} alt={asset.description || asset.title} />
      )}

      <h2>Details</h2>
      <form action={updateAsset}>
        <input type="hidden" name="id" value={asset.id} />
        <label>
          Title
          <input name="title" required maxLength={200} defaultValue={asset.title} />
        </label>
        <label>
          Description
          <textarea name="description" maxLength={2000} rows={3} defaultValue={asset.description} />
        </label>
        <div className="actions">
          <button type="submit">Save</button>
        </div>
      </form>

      <ItemFolder itemId={asset.id} folderId={asset.folderId} folders={folders} back={back} />
      <ItemTags itemId={asset.id} back={back} />
      <ItemBacklinks itemId={asset.id} />
      <form action={deleteAsset} className="delete-note">
        <input type="hidden" name="id" value={asset.id} />
        <button type="submit">Move to Trash</button>
      </form>
    </>
  );
}
