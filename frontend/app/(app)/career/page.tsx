import { redirect } from "next/navigation";

// Applications is the only part of Career for now, so Career opens there. Today replaces this when it lands.
export default function CareerPage() {
  redirect("/career/applications");
}
