import { FileTextIcon, ImageIcon } from "lucide-react";
import Link from "next/link";

import { getApi } from "@/lib/api/server";
import { itemHref } from "@/lib/items";

import { GraphCanvas } from "../graph/graph-canvas";


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
            <li key={backlink.id} className="min-w-0">
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

// The page's ?depth= for Connections: 2, or else 1.
export const parseDepth = (raw: string | string[] | undefined) => (raw === "2" ? 2 : 1);

// The local graph (docs/DESIGN.md section 6.12): the Item, what it links to and what links to it, `depth` Links away.
// Backlinks already list what links here, so the text alternative only adds the Links going out.
export async function ItemConnections({
  itemId,
  type,
  folderId,
  depth,
}: {
  itemId: string;
  type: "NOTE" | "ASSET";
  folderId: string | null;
  depth: 1 | 2;
}) {
  const api = await getApi();
  const graph = await api
    .GET("/api/items/{id}/graph", { params: { path: { id: itemId }, query: { depth } } })
    .catch(() => null);
  const nodes = graph?.data?.nodes.map((n) => ({ ...n, title: n.title || "Untitled" })) ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const linksTo = graph?.data?.edges.filter((e) => e.source === itemId).map((e) => byId.get(e.target)!) ?? [];
  const title = byId.get(itemId)?.title;

  return (
    <section aria-labelledby="connections-heading" className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="connections-heading" className="text-xs font-semibold text-muted-foreground">
          Connections
        </h2>
        <div role="group" aria-label="Depth" className="flex rounded-[8px] border border-border p-0.5 text-xs">
          {([1, 2] as const).map((d) => (
            <Link
              key={d}
              href={`?depth=${d}`}
              replace
              scroll={false}
              aria-label={d === 1 ? "1 Link away" : "2 Links away"}
              aria-current={d === depth ? "true" : undefined}
              className="grid min-h-6 min-w-6 place-items-center rounded-[6px] px-2 text-muted-foreground hover:text-foreground aria-[current]:bg-surface aria-[current]:text-foreground"
            >
              {d}
            </Link>
          ))}
        </div>
      </div>
      {!graph?.data ? (
        <p role="alert" className="text-sm">
          Could not load the Connections.
        </p>
      ) : graph.data.edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {type === "NOTE" ? "No Links yet. Type [[ in the Note to link it." : "No Links yet. Link to it from a Note with [[."}
        </p>
      ) : (
        <>
          <GraphCanvas
            key={itemId}
            nodes={nodes}
            edges={graph.data.edges}
            label={`Connections of ${title}: ${nodes.length} Items. Tab to an Item, arrow keys move along its Links.`}
            className="h-56"
            centre={itemId}
          />
          {linksTo.length > 0 && (
            <>
              <h3 id="links-to-heading" className="text-xs font-semibold text-muted-foreground">
                Links to
              </h3>
              <ul aria-labelledby="links-to-heading" className="grid gap-2">
                {linksTo.map((n) => {
                  const Icon = n.type === "NOTE" ? FileTextIcon : ImageIcon;
                  return (
                    <li key={n.id} className="min-w-0">
                      <Link
                        href={itemHref(n)}
                        className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm hover:border-link"
                      >
                        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{n.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
      <Link href={folderId ? `/graph?folderId=${folderId}` : "/graph"} className="text-sm underline underline-offset-4">
        Open in Graph
      </Link>
    </section>
  );
}
