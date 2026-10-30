import { FileTextIcon } from "lucide-react";
import Link from "next/link";

import { getApi } from "@/lib/api/server";
import { itemHref } from "@/lib/items";


// The parts of an Item's page that every Item has, whether it is a Note or an Asset.

export async function ItemBacklinks({ itemId }: { itemId: string }) {
  const api = await getApi();
  const backlinks = await api
    .GET("/api/items/{id}/backlinks", { params: { path: { id: itemId } } })
    .catch(() => null);

  return (
    <section aria-labelledby="backlinks-heading" className="grid gap-2">
      <h2 id="backlinks-heading" className="text-xs font-semibold text-muted-foreground">
        Backlinks
      </h2>
      {!backlinks?.data ? (
        <p role="alert" className="text-sm">
          Could not load the Backlinks.
        </p>
      ) : backlinks.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Notes link here yet.</p>
      ) : (
        <ul className="grid gap-2">
          {backlinks.data.items.map((backlink) => (
            <li key={backlink.id}>
              <Link
                href={itemHref({ id: backlink.id, type: "NOTE" })}
                className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm hover:border-link"
              >
                <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{backlink.title || "Untitled"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
