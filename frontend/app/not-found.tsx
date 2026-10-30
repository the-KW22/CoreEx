import Link from "next/link";

import { AuthCard } from "@/components/auth-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Every notFound() lands here: a missing or someone else's Item, Folder or Tag, and a bad id.
export default function NotFound() {
  return (
    <AuthCard title="Page not found">
      <p className="text-sm text-muted-foreground">It may have moved or been deleted.</p>
      <Link href="/" className={cn(buttonVariants(), "h-10 w-full")}>
        Go Home
      </Link>
    </AuthCard>
  );
}
