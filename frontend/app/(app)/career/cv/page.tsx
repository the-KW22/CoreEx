import { ResumeList } from "../library/resume-list";

// The User's CV, the master Resume (docs/DESIGN.md section 3.4).
export default async function CvPage({ searchParams }: PageProps<"/career/cv">) {
  return <ResumeList kind="CV" searchParams={await searchParams} />;
}
