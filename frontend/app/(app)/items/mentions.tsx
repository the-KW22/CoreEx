import { FileTextIcon } from "lucide-react";
import Link from "next/link";

import { getApi } from "@/lib/api/server";
import { itemHref } from "@/lib/items";

import { LinkItButton } from "./link-it-button";

const FIRST = 10;
const MORE = 50;

// The page's ?mentions= for this section: how many to list.
export const parseMentions = (raw: string | string[] | undefined) => (raw === String(MORE) ? MORE : FIRST);

// Notes that name this Item without linking to it, under Backlinks. A plain mention is the easiest Link to make.
export async function ItemMentions({ itemId, size, depth }: { itemId: string; size: number; depth: 1 | 2 }) {
  const api = await getApi();
  const mentions = await api
    .GET("/api/items/{id}/mentions", { params: { path: { id: itemId }, query: { size } } })
    .catch(() => null);
  const total = mentions?.data?.total ?? 0;

  return (
    <section aria-labelledby="mentions-heading" className="grid gap-2">
      <h2 id="mentions-heading" className="text-xs font-semibold text-muted-foreground">
        Mentioned without a Link{total > 0 ? ` (${total})` : ""}
      </h2>
      {!mentions?.data ? (
        <p role="alert" className="text-sm">
          Could not load the mentions.
        </p>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">No other Note mentions this title.</p>
      ) : (
        <>
          <ul className="grid gap-2">
            {mentions.data.items.map((m) => (
              <li key={m.id} className="grid min-w-0 gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
                <Link href={itemHref({ id: m.id, type: "NOTE" })} className="flex items-center gap-2 font-medium hover:underline">
                  <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{m.title || "Untitled"}</span>
                </Link>
                <p className="text-xs break-words text-muted-foreground">
                  {m.before}
                  <mark className="rounded-sm bg-link/25 px-0.5 text-foreground">{m.match}</mark>
                  {m.after}
                </p>
                <LinkItButton itemId={itemId} noteId={m.id} version={m.version} title={m.title || "Untitled"} />
              </li>
            ))}
          </ul>
          {size === FIRST && total > FIRST && (
            <Link href={`?depth=${depth}&mentions=${MORE}`} replace scroll={false} className="text-sm underline underline-offset-2">
              Show more
            </Link>
          )}
          {total > size && size === MORE && <p className="text-xs text-muted-foreground">Showing the first {MORE}.</p>}
        </>
      )}
    </section>
  );
}
