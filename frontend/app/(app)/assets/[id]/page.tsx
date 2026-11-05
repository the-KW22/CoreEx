import { DownloadIcon } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/server";
import { pathTo } from "@/lib/folders";
import { formatBytes } from "@/lib/items";

import { FolderPicker } from "../../items/folder-picker";
import { ItemFrame } from "../../items/item-frame";
import { ItemBacklinks, ItemConnections, parseDepth } from "../../items/item-sections";
import { ItemMentions, parseMentions } from "../../items/mentions";
import { TagEditor } from "../../items/tag-editor";
import { RecordOpen } from "../../search/record-open";
import { deleteAsset } from "../actions";
import { AssetText } from "./asset-text";

// The Asset screen (docs/DESIGN.md section 6.4): the Note's frame, a viewer stage, and Download.
export default async function AssetPage({ params, searchParams }: PageProps<"/assets/[id]">) {
  const { id } = await params;
  const { error, depth: rawDepth, mentions } = await searchParams;
  const depth = parseDepth(rawDepth);
  const api = await getApi();
  const [result, list, view, download, itemTags, allTags, jar] = await Promise.all([
    api.GET("/api/assets/{id}", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/assets/{id}/url", { params: { path: { id } } }).catch(() => null),
    api
      .GET("/api/assets/{id}/url", { params: { path: { id }, query: { download: true } } })
      .catch(() => null),
    api.GET("/api/items/{id}/tags", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
    cookies(),
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
  const viewUrl = view?.data?.url;
  const isPdf = asset.mimeType === "application/pdf";
  const remembered = jar.get("details")?.value;

  return (
    <>
      <RecordOpen id={asset.id} />
      <ItemFrame
        crumbs={[
          { href: "/assets", label: "Assets" },
          ...(asset.folderId ? pathTo(folders, asset.folderId) : []).map((f) => ({ href: `/folders/${f.id}`, label: f.name })),
        ]}
        current={asset.title}
        extra={
          download?.data && (
            <Button asChild variant="ghost" size="sm">
              <a href={download.data.url} download>
                <DownloadIcon aria-hidden />
                <span className="max-sm:sr-only">Download</span>
              </a>
            </Button>
          )
        }
        trash={{ id: asset.id, action: deleteAsset }}
        detailsCookie={remembered === "open" || remembered === "closed" ? remembered : null}
        details={
          <>
            {/* No key from the text: a refresh after saving must not rebuild it while the other field is being typed in. */}
            <AssetText id={asset.id} title={asset.title} description={asset.description} />
            {/* Where it lives and what it connects to, one section. */}
            <div className="grid gap-6">
              <FolderPicker itemId={asset.id} folderId={asset.folderId} folders={folders} />
              <section aria-labelledby="asset-tags-heading" className="grid gap-2">
                <h2 id="asset-tags-heading" className="text-xs font-semibold text-muted-foreground">
                  Tags
                </h2>
                {itemTags?.data ? (
                  <TagEditor itemId={asset.id} tags={itemTags.data.items} allTags={allTags?.data?.items ?? []} />
                ) : (
                  <p role="alert" className="text-sm">
                    Could not load the Tags.
                  </p>
                )}
              </section>
              <ItemBacklinks itemId={asset.id} />
              <ItemMentions itemId={asset.id} size={parseMentions(mentions)} depth={depth} />
              <ItemConnections itemId={asset.id} type="ASSET" folderId={asset.folderId} depth={depth} />
            </div>
            <section aria-labelledby="info-heading" className="grid gap-2">
              <h2 id="info-heading" className="text-xs font-semibold text-muted-foreground">
                Info
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{isPdf ? "PDF" : asset.mimeType.replace("image/", "").toUpperCase() + " image"}</dd>
                <dt className="text-muted-foreground">Size</dt>
                <dd className="font-mono">{formatBytes(asset.sizeBytes)}</dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>
                  <time dateTime={asset.updatedAt}>{asset.updatedAt.slice(0, 10)}</time>
                </dd>
                {asset.editedBy && (
                  <>
                    <dt className="text-muted-foreground">Edited by</dt>
                    <dd className="break-words">{asset.editedBy}</dd>
                  </>
                )}
              </dl>
            </section>
          </>
        }
      >
        {/* A neutral stage, so the file is the brightest thing on screen. */}
        <div className="grid flex-1 content-start gap-4 p-4 md:p-8">
          {error === "delete" && (
            <Alert>
              Could not move the Asset to the Trash. Try again.
            </Alert>
          )}
          <div className="grid min-h-80 place-items-center overflow-hidden rounded-[14px] border border-border bg-surface">
            {!viewUrl ? (
              <p role="alert" className="p-6 text-center text-sm">
                The file cannot be shown right now: file storage is not available. Try again in a moment.
              </p>
            ) : isPdf ? (
              <iframe src={viewUrl} title={`PDF: ${asset.title}`} className="h-[calc(100dvh-10rem)] w-full" />
            ) : (
              // A plain <img>: the URL is a short-lived signed link to another origin, so Next's image
              // optimizer cannot cache or resize it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewUrl}
                alt={asset.description || asset.title}
                className="max-h-[calc(100dvh-10rem)] max-w-full object-contain p-4"
              />
            )}
          </div>
        </div>
      </ItemFrame>
    </>
  );
}
