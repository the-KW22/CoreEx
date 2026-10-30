"use client";

import Link from "next/link";

import { AuthCard } from "@/components/auth-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The error boundary for every page: an unexpected failure shows this instead of a blank screen.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AuthCard title="Something went wrong">
      <p className="text-sm text-muted-foreground">Try again, or go Home.</p>
      <div className="grid gap-2">
        <Button type="button" onClick={reset} className="h-10 w-full">
          Try again
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")}>
          Go Home
        </Link>
      </div>
    </AuthCard>
  );
}
