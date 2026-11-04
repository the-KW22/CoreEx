"use client";

import { FolderTreeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { components } from "@/lib/api/schema";
import { graphFolderChoices, type Folder } from "@/lib/folders";
import { linkMaps, where, type GraphNode } from "@/lib/graph";
import { graphHref, startCollapsed, treeGraph, type GraphMode } from "@/lib/graph-tree";
import { itemHref } from "@/lib/items";

import { FolderSelect } from "../folders/folder-select";
import { ViewToggle } from "../items/view-toggle";
import { resetLayout, savePosition } from "./actions";
import { GraphCanvas } from "./graph-canvas";
import { GraphFolders } from "./graph-folders";

export function GraphView({
  graph,
  folders,
  folderId,
  mode,
  panelOpen,
}: {
  graph: components["schemas"]["GraphResponse"];
  folders: Folder[];
  folderId: string | null;
  mode: GraphMode;
  panelOpen: boolean;
}) {
  const router = useRouter();
  const { edges } = graph;
  const nodes = useMemo(() => graph.nodes.map((n) => ({ ...n, title: n.title || "Untitled" })), [graph.nodes]);
  const [table, setTable] = useState(false);
  const [panel, setPanel] = useState(panelOpen);
  const [sheet, setSheet] = useState(false);
  const href = (id: string | null) => graphHref(id, mode);
  function togglePanel() {
    setPanel(!panel);
    document.cookie = `graph-panel=${panel ? "closed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }
  // Tree mode also draws Folders with nothing in them yet.
  const hasFolders = folders.some((f) => f.parentId === folderId);
  const empty = nodes.length === 0 && !(mode === "tree" && hasFolders);

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
            onChange={(id) => router.push(href(id))}
            className="w-56"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="hidden md:inline-flex" aria-pressed={panel} onClick={togglePanel}>
            <FolderTreeIcon aria-hidden />
            Folders
          </Button>
          <Button variant="outline" className="md:hidden" onClick={() => setSheet(true)}>
            <FolderTreeIcon aria-hidden />
            Folders
          </Button>
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(value) => value && router.push(graphHref(folderId, value as GraphMode))}
            aria-label="Draw the graph by"
          >
            <ToggleGroupItem value="links">Links</ToggleGroupItem>
            <ToggleGroupItem value="tree">Tree</ToggleGroupItem>
          </ToggleGroup>
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

      <div className={panel ? "grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]" : "grid"}>
        {panel && (
          <aside aria-label="Folders" className="hidden h-[70vh] min-h-96 overflow-y-auto rounded-[14px] border border-border p-2 md:block">
            <GraphFolders folders={folders} current={folderId} href={href} />
          </aside>
        )}
        {empty ? (
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
        ) : mode === "tree" ? (
          <FolderTreeGraph items={nodes} folders={folders} folderId={folderId} scope={scope} big={graph.truncated} />
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

      {/* Phones: the panel as a Sheet. Choosing a Folder opens another page, which closes it. */}
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="w-72 overflow-y-auto border-border bg-panel p-3">
          <SheetTitle>Folders</SheetTitle>
          <GraphFolders folders={folders} current={folderId} href={href} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// The Tree mode: Folders open and shut, and everything else on the canvas works as it does for Links. A graph too big to
// show whole opens with its Folders shut.
function FolderTreeGraph({
  items,
  folders,
  folderId,
  scope,
  big,
}: {
  items: GraphNode[];
  folders: Folder[];
  folderId: string | null;
  scope: string;
  big: boolean;
}) {
  const [collapsed, setCollapsed] = useState(() => (big ? startCollapsed(folders, folderId) : new Set<string>()));
  const { nodes, edges, pos } = useMemo(() => treeGraph(folders, items, folderId, collapsed), [folders, items, folderId, collapsed]);
  const tree = useMemo(
    () => ({
      pos,
      onToggle: (id: string) =>
        setCollapsed((shut) => {
          const next = new Set(shut);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
    }),
    [pos],
  );
  return (
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      tree={tree}
      label={`Tree of ${scope}: ${nodes.length} Folders and Items. Tab to one, arrow keys move along the tree, Enter opens an Item or opens and shuts a Folder.`}
      className="h-[70vh] min-h-96"
    />
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
