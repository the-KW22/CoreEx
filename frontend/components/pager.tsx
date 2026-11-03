import Link from "next/link";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { pageRange, type pageInfo } from "@/lib/pages";

// Previous, the page numbers and Next for a list the API returns a page at a time. `href` builds the link to a page.
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
  return (
    <Pagination aria-label={label}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href={page.prev !== null ? href(page.prev) : undefined} />
        </PaginationItem>
        {pageRange(page.page, page.pages).map((n, i) => (
          <PaginationItem key={n === "..." ? `gap-${i}` : n}>
            {n === "..." ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink href={href(n)} isActive={n === page.page} aria-label={`Page ${n + 1}`}>
                {n + 1}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext href={page.next !== null ? href(page.next) : undefined} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
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
