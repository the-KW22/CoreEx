import { ChevronRightIcon, FilePlusIcon, FolderIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { Alert } from "@/components/alert";
import { PageGone, Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import type { Folder } from "@/lib/folders";
import { listHref, type ItemType } from "@/lib/items";
import { pageInfo } from "@/lib/pages";
import { parseCollapsed, parseView } from "@/lib/prefs";

import { ItemCount } from "../folders/item-count";
import { NewApplication } from "../career/applications/new-application";
import { createNote } from "../notes/actions";
import { PickButton } from "./item-menus";
import { ItemsBrowser } from "./items-browser";
import { Section } from "./section";
import { TypeFilter } from "./type-filter";
import { ViewToggle } from "./view-toggle";

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
  /** The ?type= filter in use, if any. */
  type?: ItemType;
  empty: string;
  /** Beside the title, for the actions of what is being viewed. */
  titleExtra?: React.ReactNode;
  /** A failed action's message, shown under the header. */
  alert?: string;
  /** Anything the page adds under the list, such as managing the Folder. */
  children?: React.ReactNode;
  /** The Assets page: Upload is its only action (a Note or an Import is not an Asset). */
  assetsOnly?: boolean;
};

// The layout All Items, a Folder, a Tag and Assets share (docs/DESIGN.md section 6.2).
export async function ItemsView({ crumbs, title, folderId, cards, folders, tags, items, page, path, type, empty, alert, titleExtra, children, assetsOnly }: Props) {
  const jar = await cookies();
  const view = parseView(jar.get("view")?.value);
  const collapsed = parseCollapsed(jar.get("collapsed")?.value);
  const newNote = assetsOnly ? null : (
    <form action={createNote}>
      {folderId && <input type="hidden" name="folderId" value={folderId} />}
      <Button type="submit">
        <FilePlusIcon aria-hidden />
        New Note
      </Button>
    </form>
  );
  const pageHref = (n: number) => listHref(path, n, type);

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
          <div className="flex flex-wrap items-center gap-2">
            {items.total > 0 && (
              <ViewToggle
                saved={view}
                graphHref={path === "/items" ? "/graph" : path.startsWith("/folders/") ? `/graph?folderId=${folderId}` : undefined}
              />
            )}
            {newNote}
            {!assetsOnly && <NewApplication />}
            <PickButton kind="upload" />
            {!assetsOnly && <PickButton kind="import" />}
          </div>
        </div>
        {alert && (
          <Alert>
            {alert}
          </Alert>
        )}
      </header>

      {cards.length > 0 && (
        <Section id="folders" heading="Folders" open={!collapsed.has("folders")}>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {cards.map((folder) => (
              <li key={folder.id}>
                <Link
                  href={`/folders/${folder.id}`}
                  className="group flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-link"
                >
                  <FolderIcon aria-hidden className="size-6 shrink-0 fill-primary/20 text-link transition-transform group-hover:-rotate-6" />
                  <span className="truncate text-sm font-medium">{folder.name}</span>
                  <ItemCount count={folder.itemCount} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        id="items"
        heading={
          <>
            Items <span className="font-mono font-normal">({items.total})</span>
          </>
        }
        open={!collapsed.has("items")}
      >
        {!assetsOnly && (items.total > 0 || type) && <TypeFilter path={path} type={type} />}
        {items.total === 0 && type ? (
          <p className="text-muted-foreground">No {type === "NOTE" ? "Notes" : "Assets"} here.</p>
        ) : items.total === 0 ? (
          <div className="grid justify-items-center gap-3 rounded-[14px] border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">{empty}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {newNote}
            {!assetsOnly && <NewApplication />}
              <PickButton kind="upload" />
            </div>
          </div>
        ) : items.items.length === 0 ? (
          <PageGone first={pageHref(0)} />
        ) : (
          <ItemsBrowser saved={view} items={items.items} folders={folders} tags={tags} />
        )}
        <Pager page={page} href={pageHref} />
      </Section>

      {children}
    </div>
  );
}
