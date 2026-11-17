import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { Alert } from "@/components/alert";
import { getApi } from "@/lib/api/server";
import { pathTo } from "@/lib/folders";

import { FolderPicker } from "../../../items/folder-picker";
import { ItemFrame } from "../../../items/item-frame";
import { ItemBacklinks, parseDepth } from "../../../items/item-sections";
import { ItemMentions, parseMentions } from "../../../items/mentions";
import { TagEditor } from "../../../items/tag-editor";
import { RecordOpen } from "../../../search/record-open";
import { deleteApplication } from "../actions";
import { EarlierNotice } from "../earlier-notice";
import { ApplicationView } from "./application-view";
import { Documents } from "./documents";
import { LinkedDocuments } from "./linked-documents";
import { Workspace } from "./workspace";

// The Application screen: the Item frame (breadcrumb, Move to Trash, and a Details panel with its Folder and Tags)
// around its fields edited in place, the Stage stepper, the timeline and the posting.
export default async function ApplicationPage({ params, searchParams }: PageProps<"/career/applications/[id]">) {
  const { id } = await params;
  const { error, depth: rawDepth, mentions, tab, interview } = await searchParams;
  const api = await getApi();
  const [result, list, itemTags, allTags, docs, linked, library, apply, debriefs, jar] = await Promise.all([
    api.GET("/api/applications/{id}", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/items/{id}/tags", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
    api.GET("/api/applications/{id}/documents", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/applications/{id}/linked-documents", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/applications/{id}/career/results", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/applications/{id}/career/apply", { params: { path: { id } } }).catch(() => null),
    api.GET("/api/applications/{id}/career/debriefs", { params: { path: { id } } }).catch(() => null),
    cookies(),
  ]);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Another User's Application is a 404 too, and an id that is not a UUID is a 400.
  if (result.response.status === 404 || result.response.status === 400) notFound();
  const application = result.data;
  if (!application) {
    return <p role="alert">Could not load the Application. Try again.</p>;
  }

  const earlier = await api
    .GET("/api/applications/applied-before", { params: { query: { company: application.company, excludeId: application.id } } })
    .catch(() => null);
  const folders = list?.data?.items ?? [];
  const remembered = jar.get("details")?.value;

  return (
    <>
      <RecordOpen id={application.id} />
      <ItemFrame
        crumbs={[
          { href: "/career/applications", label: "Applications" },
          ...(application.folderId ? pathTo(folders, application.folderId) : []).map((f) => ({
            href: `/folders/${f.id}`,
            label: f.name,
          })),
        ]}
        current={application.title}
        trash={{ id: application.id, action: deleteApplication }}
        detailsCookie={remembered === "open" || remembered === "closed" ? remembered : null}
        details={
          <div className="grid gap-6">
            <FolderPicker itemId={application.id} folderId={application.folderId} folders={folders} />
            <section aria-labelledby="application-tags-heading" className="grid gap-2">
              <h2 id="application-tags-heading" className="text-xs font-semibold text-muted-foreground">
                Tags
              </h2>
              {itemTags?.data ? (
                <TagEditor itemId={application.id} tags={itemTags.data.items} allTags={allTags?.data?.items ?? []} />
              ) : (
                <p role="alert" className="text-sm">
                  Could not load the Tags.
                </p>
              )}
            </section>
            <ItemBacklinks itemId={application.id} />
            <ItemMentions itemId={application.id} size={parseMentions(mentions)} depth={parseDepth(rawDepth)} />
          </div>
        }
      >
        <div className="grid flex-1 content-start gap-4 p-4 md:p-8">
          {error === "delete" && <Alert>Could not move the Application to the Trash. Try again.</Alert>}
          <Workspace
            applicationId={application.id}
            stage={application.stage}
            library={library?.data ?? null}
            apply={apply?.data ?? null}
            timeline={application.timeline}
            debriefs={debriefs?.data?.items ?? null}
            linked={linked?.data ?? null}
            nextStep={application.nextStep}
            appliedOn={application.appliedOn ?? null}
            initialTab={typeof tab === "string" ? tab : undefined}
            initialInterview={typeof interview === "string" && /^\d{1,6}$/.test(interview) ? Number(interview) : undefined}
            details={
              <>
                <EarlierNotice className="mx-auto w-full max-w-3xl" company={application.company} items={earlier?.data?.items ?? []} />
                <ApplicationView initial={application} />
                <div className="mx-auto w-full max-w-3xl">
                  {linked?.data ? <LinkedDocuments key={JSON.stringify(linked.data)} applicationId={application.id} initial={linked.data} /> : <p role="alert">Could not load linked documents.</p>}
                </div>
                <div className="mx-auto w-full max-w-3xl">
                  {docs?.data ? (
                    <Documents applicationId={application.id} documents={docs.data.items} />
                  ) : (
                    <p role="alert" className="text-sm">
                      Could not load the PDFs.
                    </p>
                  )}
                </div>
              </>
            }
          />
        </div>
      </ItemFrame>
    </>
  );
}
