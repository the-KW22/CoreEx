import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { RecordOpen } from "../../../search/record-open";
import { ApplicationView } from "./application-view";

// The Application screen: its fields edited in place, the Stage stepper, the timeline and the posting.
export default async function ApplicationPage({ params }: PageProps<"/career/applications/[id]">) {
  const { id } = await params;
  const api = await getApi();
  const result = await api.GET("/api/applications/{id}", { params: { path: { id } } }).catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Another User's Application is a 404 too, and an id that is not a UUID is a 400.
  if (result.response.status === 404 || result.response.status === 400) notFound();
  if (!result.data) {
    return <p role="alert">Could not load the Application. Try again.</p>;
  }

  return (
    <>
      <RecordOpen id={result.data.id} />
      <ApplicationView initial={result.data} />
    </>
  );
}
