import { ChevronRightIcon, FilePlusIcon, FolderIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import type { Folder } from "@/lib/folders";
import { pageInfo } from "@/lib/pages";

import { createNote } from "../notes/actions";
import { ItemsTable, PickButton } from "./items-table";

export const PAGE_SIZE = 50;

type Props = {
  crumbs: { href: string; label: string }[];
  title: string;
  /** Where New Note and uploads go: the Folder being viewed, or the top level. */
  folderId: string | null;
  /** Folders shown as cards: top-level ones, sub-Folders, or none. */
  cards: Folder[];
  /** Every Folder, for names and the Move dialog. */
  folders: Folder[];
  tags: { id: string; name: string }[];
  items: components["schemas"]["ItemPage"];
  page: ReturnType<typeof pageInfo>;
  /** This page's path, for the paging links. */
  path: string;
  empty: string;
  /** Beside the title, for the actions of what is being viewed. */
  titleExtra?: React.ReactNode;
  /** A failed action's message, shown under the header. */
  alert?: string;
  /** Anything the page adds under the list, such as managing the Folder. */
  children?: React.ReactNode;
};

// The layout All Items, a Folder and a Tag share (docs/DESIGN.md section 6.2).
export function ItemsView({ crumbs, title, folderId, cards, folders, tags, items, page, path, empty, alert, titleExtra, children }: Props) {
  const newNote = (
    <form action={createNote}>
      {folderId && <input type="hidden" name="folderId" value={folderId} />}
      <Button type="submit">
        <FilePlusIcon aria-hidden />
        New Note
      </Button>
    </form>
  );
  const pageHref = (n: number) => (n === 0 ? path : `${path}?page=${n}`);

  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="grid gap-3">
        {/* All Items has nothing above it, and a breadcrumb of just the title says nothing. */}
        {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((crumb) => (
              <li key={crumb.href} className="flex items-center gap-1">
                <Link href={crumb.href} className="hover:text-foreground hover:underline">
                  {crumb.label}
                </Link>
                <ChevronRightIcon aria-hidden className="size-3.5" />
              </li>
            ))}
            <li aria-current="page" className="text-foreground">
              {title}
            </li>
          </ol>
        </nav>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
            {titleExtra}
          </div>
          <div className="flex flex-wrap gap-2">
            {newNote}
            <PickButton kind="upload" />
            <PickButton kind="import" />
          </div>
        </div>
        {alert && (
          <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm">
            {alert}
          </p>
        )}
      </header>

      {cards.length > 0 && (
        <section aria-labelledby="folders-heading" className="grid gap-3">
          <h2 id="folders-heading" className="text-sm font-semibold text-muted-foreground">
            Folders
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {cards.map((folder) => (
              <li key={folder.id}>
                <Link
                  href={`/folders/${folder.id}`}
                  className="group flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-link"
                >
                  <FolderIcon aria-hidden className="size-6 shrink-0 fill-primary/20 text-link transition-transform group-hover:-rotate-6" />
                  <span className="truncate text-sm font-medium">{folder.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="items-heading" className="grid gap-3">
        <h2 id="items-heading" className="text-sm font-semibold text-muted-foreground">
          Items <span className="font-mono font-normal">({items.total})</span>
        </h2>
        {items.total === 0 ? (
          <div className="grid justify-items-center gap-3 rounded-[14px] border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">{empty}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {newNote}
              <PickButton kind="upload" />
            </div>
          </div>
        ) : items.items.length === 0 ? (
          <p className="text-muted-foreground">
            This page is empty.{" "}
            <Link href={path} className="text-link underline-offset-4 hover:underline">
              Go to the first page
            </Link>
            .
          </p>
        ) : (
          <ItemsTable items={items.items} folders={folders} tags={tags} />
        )}
        {page.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-4 text-sm">
            {page.prev !== null ? (
              <Link href={pageHref(page.prev)} className="text-link underline-offset-4 hover:underline">
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Page {page.page + 1} of {page.pages}
            </span>
            {page.next !== null ? (
              <Link href={pageHref(page.next)} className="text-link underline-offset-4 hover:underline">
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>

      {children}
    </div>
  );
}
