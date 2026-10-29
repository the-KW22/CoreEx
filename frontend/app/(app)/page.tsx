import { FilePlusIcon, FileTextIcon, ImageIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { TagBadge } from "@/components/tag-badge";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/server";
import { pathTo, type Folder } from "@/lib/folders";
import { formatBytes, itemHref } from "@/lib/items";
import { relativeTime } from "@/lib/time";

import { PickButton } from "./items/items-table";
import { createNote } from "./notes/actions";

const failures: Record<string, string> = {
  create: "Could not create the Note. Try again.",
  folder: "Could not create the Folder. Try again.",
};

const card = "rounded-[14px] border border-border bg-surface";
// Sections fade and rise in one after another. CSS, not Motion: it starts with the HTML instead of waiting for the
// JavaScript, and reduced motion skips it.
const enter = (delay: string) =>
  `animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-(--duration-slow) ease-(--ease-out) motion-reduce:animate-none ${delay}`;
const heading = "text-sm font-semibold text-muted-foreground";

function NewNote() {
  return (
    <form action={createNote}>
      <Button type="submit">
        <FilePlusIcon aria-hidden />
        New Note
      </Button>
    </form>
  );
}

const TypeIcon = ({ type }: { type: "NOTE" | "ASSET" }) => {
  const Icon = type === "NOTE" ? FileTextIcon : ImageIcon;
  return (
    <>
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">{type === "NOTE" ? "Note:" : "Asset:"}</span>
    </>
  );
};

const folderPath = (folders: Folder[], id: string | null) =>
  id ? pathTo(folders, id).map((f) => f.name).join(" / ") : "Top level";

// Home (docs/DESIGN.md section 6.1): everything here comes from endpoints the other screens already use.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { failed } = await searchParams;
  const failure = typeof failed === "string" ? failures[failed] : undefined;

  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="grid gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Welcome</h1>
          <p className="text-muted-foreground">Pick up where you left off, or start something new.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewNote />
          <PickButton kind="upload" />
          <PickButton kind="import" label="Import Markdown" />
        </div>
        {failure && (
          <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm">
            {failure}
          </p>
        )}
      </header>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeSections />
      </Suspense>
    </div>
  );
}

async function HomeSections() {
  const api = await getApi();
  const [items, recent, tags, usage, folders] = await Promise.all([
    api.GET("/api/items", { params: { query: { size: 6 } } }).catch(() => null),
    api.GET("/api/search/quick", { params: { query: { q: "" } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
    api.GET("/api/assets/usage").catch(() => null),
    api.GET("/api/folders").catch(() => null),
  ]);

  if (!items?.data) {
    return (
      <div role="alert" className={`${card} grid gap-1 p-6`}>
        <p className="font-semibold text-foreground">Could not load your Home.</p>
        <p className="text-sm text-muted-foreground">Check that CoreEx can reach its API, then reload the page.</p>
      </div>
    );
  }

  if (items.data.total === 0) {
    return (
      <div className={`${card} grid justify-items-center gap-3 border-dashed p-10 text-center`}>
        <p className="text-lg font-semibold">Your knowledge base is empty</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Write your first Note, or upload images, PDFs and Markdown files you already have.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <NewNote />
          <PickButton kind="upload" />
        </div>
      </div>
    );
  }

  const allFolders = folders?.data?.items ?? [];
  const recentlyOpened = recent?.data?.items ?? [];
  const tagList = tags?.data?.items ?? [];
  const topTags = [...tagList].filter((t) => t.itemCount > 0).sort((a, b) => b.itemCount - a.itemCount).slice(0, 12);
  // "Now" from the API's own clock, the one that stamped updatedAt, so a skewed clock here cannot say "in 5 minutes".
  const now = Date.parse(items.response.headers.get("date") ?? "");
  const used = usage?.data;
  const percent = used && used.quotaBytes > 0 ? Math.min(100, Math.round((used.usedBytes / used.quotaBytes) * 100)) : 0;

  return (
    <div className="grid gap-8">
      <section aria-labelledby="stats-heading" className={`grid gap-3 ${enter("delay-0")}`}>
        <h2 id="stats-heading" className="sr-only">
          At a glance
        </h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_2fr]">
          <div className={`${card} grid gap-1 p-4`}>
            <dt className="text-xs text-muted-foreground">Items</dt>
            <dd className="font-mono text-2xl font-medium">{items.data.total}</dd>
          </div>
          <div className={`${card} grid gap-1 p-4`}>
            <dt className="text-xs text-muted-foreground">Tags</dt>
            <dd className="font-mono text-2xl font-medium">{tags?.data ? tags.data.total : "—"}</dd>
          </div>
          <div className={`${card} col-span-2 grid gap-2 p-4 md:col-span-1`}>
            <dt className="text-xs text-muted-foreground">Storage</dt>
            <dd className="grid gap-2">
              {used ? (
                <>
                  <span className="font-mono text-sm">
                    {formatBytes(used.usedBytes)} of {formatBytes(used.quotaBytes)}
                  </span>
                  <div
                    role="meter"
                    aria-label="Storage used"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-valuetext={`${percent}% of your Storage Quota`}
                    className="h-2 overflow-hidden rounded-full bg-border"
                  >
                    {/* At least a sliver once anything is stored, so the bar never looks empty next to "300 KB". */}
                    <div
                      className="h-full rounded-full bg-link"
                      style={{ width: `${used.usedBytes > 0 ? Math.max(1, percent) : 0}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Could not load storage.</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {recentlyOpened.length > 0 && (
        <section aria-labelledby="jump-heading" className={`grid gap-3 ${enter("delay-60")}`}>
          <h2 id="jump-heading" className={heading}>
            Jump back in
          </h2>
          <ul className="flex flex-wrap gap-2">
            {recentlyOpened.slice(0, 8).map((hit) => (
              <li key={hit.id}>
                <Link
                  href={itemHref(hit)}
                  className="flex max-w-64 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:border-link"
                >
                  <TypeIcon type={hit.type} />
                  <span className="truncate">{hit.title || "Untitled"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="edited-heading" className={`grid gap-3 ${enter("delay-120")}`}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="edited-heading" className={heading}>
            Recently edited
          </h2>
          <Link href="/items" className="text-sm text-link underline-offset-4 hover:underline">
            All Items
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.data.items.map((item) => (
            <li key={item.id}>
              <Link href={itemHref(item)} className={`${card} grid h-full gap-2 p-4 transition-colors hover:border-link`}>
                <span className="flex items-center gap-2 font-medium">
                  <TypeIcon type={item.type} />
                  <span className="truncate">{item.title || "Untitled"}</span>
                </span>
                <span className="truncate text-xs text-muted-foreground">{folderPath(allFolders, item.folderId)}</span>
                <time dateTime={item.updatedAt} className="text-xs text-muted-foreground">
                  {Number.isNaN(now) ? item.updatedAt.slice(0, 10) : `Edited ${relativeTime(item.updatedAt, now)}`}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {topTags.length > 0 && (
        <section aria-labelledby="tags-heading" className={`grid gap-3 ${enter("delay-180")}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="tags-heading" className={heading}>
              Your Tags
            </h2>
            <Link href="/tags" className="text-sm text-link underline-offset-4 hover:underline">
              All Tags
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2">
            {topTags.map((tag) => (
              <li key={tag.id}>
                <Link href={`/tags/${tag.id}`} className="flex items-center gap-1.5 rounded-full">
                  <TagBadge name={tag.name} />
                  <span className="font-mono text-xs text-muted-foreground">{tag.itemCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// The same shapes as HomeSections, so nothing jumps when the data arrives.
function HomeSkeleton() {
  const block = "animate-pulse rounded-[14px] bg-surface";
  return (
    <div role="status" className="grid gap-8">
      <span className="sr-only">Loading your Home…</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_2fr]">
        <div className={`${block} h-20`} />
        <div className={`${block} h-20`} />
        <div className={`${block} col-span-2 h-20 md:col-span-1`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${block} h-24`} />
        ))}
      </div>
    </div>
  );
}
