import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <span className="mr-auto flex items-center gap-2.5 font-semibold text-foreground">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">C</span>
          CoreEx
        </span>
        <Link href="/login" className="hover:text-foreground">Sign in</Link>
        <Link href="#request-access" className="hover:text-foreground">Request access</Link>
        <span>Your personal knowledge base.</span>
      </div>
    </footer>
  );
}
