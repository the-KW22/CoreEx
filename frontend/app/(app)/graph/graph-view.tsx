"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { graphFolderChoices, type Folder } from "@/lib/folders";
import { linkMaps, where, type GraphNode } from "@/lib/graph";
import { itemHref } from "@/lib/items";

import { FolderSelect } from "../folders/folder-select";
import { ViewToggle } from "../items/view-toggle";
import { resetLayout, savePosition } from "./actions";
import { GraphCanvas } from "./graph-canvas";

export function GraphView({
  graph,
  folders,
  folderId,
}: {
  graph: components["schemas"]["GraphResponse"];
  folders: Folder[];
  folderId: string | null;
}) {
  const router = useRouter();
  const { edges } = graph;
  const nodes = useMemo(() => graph.nodes.map((n) => ({ ...n, title: n.title || "Untitled" })), [graph.nodes]);
  const [table, setTable] = useState(false);

  const listHref = folderId ? `/folders/${folderId}` : "/items";
  const scope = folderId ? (folders.find((f) => f.id === folderId)?.name ?? "this Folder") : "All Items";

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Graph</h1>
          <FolderSelect
            name="folderId"
            label="Folder"
            folders={graphFolderChoices(folders, folderId)}
            selected={folderId}
            emptyLabel="All Items"
            onChange={(id) => router.push(id ? `/graph?folderId=${id}` : "/graph")}
            className="w-56"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {nodes.length > 0 && (
            <Button variant="outline" aria-pressed={table} onClick={() => setTable(!table)}>
              {table ? "Show as graph" : "Show as table"}
            </Button>
          )}
          <ViewToggle saved="graph" listHref={listHref} />
        </div>
      </header>

      {graph.truncated && (
        <Alert role="status" tone="neutral">
          Showing {nodes.length} of {graph.total} Items. Open a smaller Folder to see them all.
        </Alert>
      )}

      {nodes.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-[14px] border border-dashed border-border px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">Map how your Items connect</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Every Note and Asset in {scope} appears here as a dot, and every Link as a line. Type [[ in a Note to link it.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href={listHref}>Open {scope}</Link>
          </Button>
        </div>
      ) : table ? (
        <GraphTable nodes={nodes} edges={edges} />
      ) : (
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          label={`Graph of ${scope}: ${nodes.length} Items. Tab to an Item, arrow keys move along its Links.`}
          className="h-[70vh] min-h-96"
          onDrop={async (id, x, y) => {
            if (!(await savePosition(id, folderId, x, y))) toast.error("Could not save where you put it. Try again.");
          }}
          onReset={async () => {
            const ok = await resetLayout(folderId);
            if (!ok) toast.error("Could not reset the layout. Try again.");
            return ok;
          }}
        />
      )}
    </div>
  );
}

// The same graph as rows, for anyone who can't or would rather not use the picture.
function GraphTable({ nodes, edges }: { nodes: GraphNode[]; edges: components["schemas"]["GraphEdgeResponse"][] }) {
  const titles = new Map(nodes.map((n) => [n.id, n.title]));
  const { out, into } = linkMaps(edges);
  const names = (ids: string[] | undefined) => ids?.map((id) => titles.get(id)).join(", ") || "None";
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Items and their Links</caption>
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-2 font-medium">Item</th>
            <th scope="col" className="px-4 py-2 font-medium">Kind</th>
            <th scope="col" className="px-4 py-2 font-medium">Links to</th>
            <th scope="col" className="px-4 py-2 font-medium">Linked from</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id} className="border-b border-border-subtle last:border-0">
              <th scope="row" className="px-4 py-2 font-medium">
                <Link href={itemHref(n)} className="hover:underline">
                  {n.title}
                </Link>
                {n.stub && <span className="block text-xs font-normal text-muted-foreground">{where(n)}</span>}
              </th>
              <td className="px-4 py-2">{n.type === "NOTE" ? "Note" : "Asset"}</td>
              <td className="px-4 py-2">{names(out.get(n.id))}</td>
              <td className="px-4 py-2">{names(into.get(n.id))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
