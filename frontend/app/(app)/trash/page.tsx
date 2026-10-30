import Link from "next/link";

import { Pager } from "@/components/pager";
import { getApi } from "@/lib/api/server";
import { pageInfo } from "@/lib/pages";

import { EmptyTrash, TrashTable } from "./trash-table";

const PAGE_SIZE = 50;

// The Trash screen (docs/DESIGN.md section 6.9).
export default async function TrashPage({ searchParams }: PageProps<"/trash">) {
  const { page: raw } = await searchParams;
  const requested = pageInfo(0, raw, PAGE_SIZE).page;
  const api = await getApi();
  const result = await api
    .GET("/api/trash", { params: { query: { page: requested, size: PAGE_SIZE } } })
    .catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load the Trash. Try again.</p>;
  }
  const { items, total } = result.data;
  const page = pageInfo(total, raw, PAGE_SIZE);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Trash</h1>
          <p className="text-sm text-muted-foreground">Items you move to the Trash stay here for 30 days.</p>
        </div>
        {total > 0 && <EmptyTrash />}
      </header>

      {total === 0 ? (
        <div className="grid justify-items-center gap-1 rounded-[14px] border border-dashed border-border p-10 text-center">
          <p className="font-medium">Trash is empty</p>
          <p className="text-sm text-muted-foreground">Items you move to Trash stay here for 30 days.</p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">
          This page is empty.{" "}
          <Link href="/trash" className="text-link underline-offset-4 hover:underline">
            Go to the first page
          </Link>
          .
        </p>
      ) : (
        <TrashTable entries={items} />
      )}
      <Pager page={page} href={(n) => (n === 0 ? "/trash" : `/trash?page=${n}`)} />
    </div>
  );
}
