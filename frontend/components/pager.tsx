import Link from "next/link";

import type { pageInfo } from "@/lib/pages";

// Previous, "Page x of y" and Next for a list the API returns a page at a time. `href` builds the link to a page.
export function Pager({
  page,
  href,
  label = "Pages",
}: {
  page: ReturnType<typeof pageInfo>;
  href: (page: number) => string;
  label?: string;
}) {
  if (page.pages <= 1) return null;
  const link = "text-link underline-offset-4 hover:underline";
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4 text-sm">
      {page.prev !== null ? (
        <Link href={href(page.prev)} className={link}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">
        Page {page.page + 1} of {page.pages}
      </span>
      {page.next !== null ? (
        <Link href={href(page.next)} className={link}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

// What a list shows when it has Items but the page asked for is past the end.
export function PageGone({ first }: { first: string }) {
  return (
    <p className="text-muted-foreground">
      This page is empty.{" "}
      <Link href={first} className="text-link underline-offset-4 hover:underline">
        Go to the first page
      </Link>
      .
    </p>
  );
}
