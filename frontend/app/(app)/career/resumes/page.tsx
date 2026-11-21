import { ResumeList } from "../library/resume-list";

// The User's Resumes, one for each Application (docs/DESIGN.md section 3.4).
export default async function ResumesPage({ searchParams }: PageProps<"/career/resumes">) {
  return <ResumeList kind="RESUME" searchParams={await searchParams} />;
}
