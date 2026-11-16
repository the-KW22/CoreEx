import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { RecordOpen } from "../../../search/record-open";
import { ResumeEditor } from "./resume-editor";

// The Resume editor (docs/DESIGN.md section 3.4). Write mode now; Design and Check come with their own tickets.
export default async function ResumePage({ params }: PageProps<"/career/resumes/[id]">) {
  const { id } = await params;
  const api = await getApi();
  const result = await api.GET("/api/resumes/{id}", { params: { path: { id } } }).catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // Another User's Resume is a 404 too, and an id that is not a UUID is a 400.
  if (result.response.status === 404 || result.response.status === 400) notFound();
  const resume = result.data;
  if (!resume) {
    return <p role="alert">Could not load the Resume. Try again.</p>;
  }

  return (
    <>
      <RecordOpen id={resume.id} />
      <ResumeEditor key={resume.id} id={resume.id} initial={{ title: resume.title, document: resume.document, version: resume.version, locked: resume.locked }} />
    </>
  );
}
