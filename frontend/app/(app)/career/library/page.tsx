import { redirect } from "next/navigation";

// The Library gave way to a page each for the CV, Resumes and Cover Letters (#368): old links land on Resumes.
export default function LibraryPage() {
  redirect("/career/resumes");
}
