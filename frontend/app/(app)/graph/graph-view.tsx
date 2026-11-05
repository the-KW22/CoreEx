"use client";

import { FolderTreeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TagBadge } from "@/components/tag-badge";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { components } from "@/lib/api/schema";
import { graphFolderChoices, type Folder } from "@/lib/folders";
import {
  linkedOnly,
  linkMaps,
  matchesFilter,
  nodeColours,
  readFilter,
  where,
  writeFilter,
  type GraphEdge,
  type GraphFilter,
  type GraphNode,
  type GraphTag,
} from "@/lib/graph";
import { graphHref, startCollapsed, treeGraph, type GraphMode } from "@/lib/graph-tree";
import { itemHref } from "@/lib/items";
import type { TagColour } from "@/lib/tag-colour";

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
  const params = useSearchParams();
  const allNodes = useMemo(() => graph.nodes.map((n) => ({ ...n, title: n.title || "Untitled" })), [graph.nodes]);
  const asked = useMemo(() => readFilter(params), [params]);
  // A Tag from another Folder's graph (the filter follows the User between Folders) cannot match here, so it is ignored.
  const filter = useMemo(
    () => ({ ...asked, tags: asked.tags.filter((id) => graph.tags.some((t) => t.id === id)) }),
    [asked, graph.tags],
  );
  // Tree mode draws Folders rather than Links, so Only linked Items waits in the address for the way back.
  const hideUnlinked = filter.linkedOnly && mode === "links";
  const { nodes, edges } = useMemo(
    () => (hideUnlinked ? linkedOnly(allNodes, graph.edges) : { nodes: allNodes, edges: graph.edges }),
    [allNodes, graph.edges, hideUnlinked],
  );
  const dimmed = useMemo(() => new Set(nodes.filter((n) => !matchesFilter(n, filter)).map((n) => n.id)), [nodes, filter]);
  const painted = useMemo(() => (filter.colour ? nodeColours(nodes, graph.tags, filter.colour) : null), [nodes, graph.tags, filter.colour]);
  const tagNames = useMemo(() => {
    const names = new Map(graph.tags.map((t) => [t.id, t.name]));
    return new Map(nodes.map((n) => [n.id, n.tagIds.map((id) => names.get(id)!).filter(Boolean)]));
  }, [nodes, graph.tags]);
  const [table, setTable] = useState(false);
  const [panel, setPanel] = useState(panelOpen);
  const [sheet, setSheet] = useState(false);
  const href = (id: string | null) => graphHref(id, mode, filter);
  // In the address only: nothing needs fetching again, so the page does not go back to the server.
  function setFilter(next: GraphFilter) {
    const query = new URLSearchParams(params);
    writeFilter(query, next);
    const text = query.toString();
    window.history.replaceState(null, "", text ? `/graph?${text}` : "/graph");
  }
  function togglePanel() {
    setPanel(!panel);
    document.cookie = `graph-panel=${panel ? "closed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }
  // Tree mode also draws Folders with nothing in them yet.
  const hasFolders = folders.some((f) => f.parentId === folderId);
  const empty = allNodes.length === 0 && !(mode === "tree" && hasFolders);

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
            onValueChange={(value) => value && router.push(graphHref(folderId, value as GraphMode, filter))}
            aria-label="Draw the graph by"
          >
            <ToggleGroupItem value="links">Links</ToggleGroupItem>
            <ToggleGroupItem value="tree">Tree</ToggleGroupItem>
          </ToggleGroup>
          {allNodes.length > 0 && (
            <Button variant="outline" aria-pressed={table} onClick={() => setTable(!table)}>
              {table ? "Show as graph" : "Show as table"}
            </Button>
          )}
          <ViewToggle saved="graph" listHref={listHref} />
        </div>
      </header>

      {graph.truncated && (
        <Alert role="status" tone="neutral">
          Showing {allNodes.length} of {graph.total} Items. Open a smaller Folder to see them all.
        </Alert>
      )}

      {allNodes.length > 0 && (
        <GraphFilters
          filter={filter}
          tags={graph.tags}
          mode={mode}
          matching={nodes.length - dimmed.size}
          total={allNodes.length}
          onChange={setFilter}
        />
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
        ) : nodes.length === 0 && mode === "links" ? (
          <div className="grid justify-items-center gap-2 rounded-[14px] border border-dashed border-border px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">No linked Items here</h2>
            <p className="max-w-md text-sm text-muted-foreground">Nothing in {scope} has a Link to another Item in it yet.</p>
            <Button variant="outline" className="mt-2" onClick={() => setFilter({ ...filter, linkedOnly: false })}>
              Show all Items
            </Button>
          </div>
        ) : table ? (
          <GraphTable nodes={nodes.filter((n) => !dimmed.has(n.id))} edges={edges} tagNames={tagNames} />
        ) : mode === "tree" ? (
          <FolderTreeGraph
            items={nodes}
            folders={folders}
            folderId={folderId}
            scope={scope}
            big={graph.truncated}
            dimmed={dimmed}
            colours={painted?.colours}
            tagNames={tagNames}
            legend={painted && <Legend {...painted} />}
          />
        ) : (
          <GraphCanvas
            // Only linked Items changes the shape of the graph, so it is laid out and fitted afresh.
            key={hideUnlinked ? "linked" : "all"}
            nodes={nodes}
            edges={edges}
            dimmed={dimmed}
            colours={painted?.colours}
            tagNames={tagNames}
            legend={painted && <Legend {...painted} />}
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

      {/* Phones: the panel as a Sheet, which any link in it closes. */}
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent
          side="left"
          className="w-72 overflow-y-auto border-border bg-panel p-3"
          onClick={(e) => (e.target as HTMLElement).closest("a") && setSheet(false)}
        >
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
  dimmed,
  colours,
  tagNames,
  legend,
}: {
  items: GraphNode[];
  folders: Folder[];
  folderId: string | null;
  scope: string;
  big: boolean;
  dimmed: Set<string>;
  colours?: Map<string, TagColour>;
  tagNames: Map<string, string[]>;
  legend: React.ReactNode;
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
      dimmed={dimmed}
      colours={colours}
      tagNames={tagNames}
      legend={legend}
      label={`Tree of ${scope}: ${nodes.length} Folders and Items. Tab to one, arrow keys move along the tree, Enter opens an Item or opens and shuts a Folder.`}
      className="h-[70vh] min-h-96"
    />
  );
}

function GraphFilters({
  filter,
  tags,
  mode,
  matching,
  total,
  onChange,
}: {
  filter: GraphFilter;
  tags: GraphTag[];
  mode: GraphMode;
  matching: number;
  total: number;
  onChange: (filter: GraphFilter) => void;
}) {
  const filtering = filter.tags.length > 0 || filter.type || (filter.linkedOnly && mode === "links");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter.type ?? "ALL"}
          onValueChange={(value) => value && onChange({ ...filter, type: value === "ALL" ? null : (value as GraphFilter["type"]) })}
          aria-label="Show only"
        >
          <ToggleGroupItem value="ALL">All</ToggleGroupItem>
          <ToggleGroupItem value="NOTE">Notes</ToggleGroupItem>
          <ToggleGroupItem value="ASSET">Assets</ToggleGroupItem>
        </ToggleGroup>
        {mode === "links" && (
          <Toggle variant="outline" pressed={filter.linkedOnly} onPressedChange={(linkedOnly) => onChange({ ...filter, linkedOnly })}>
            Only linked Items
          </Toggle>
        )}
        <div className="flex items-center gap-2">
          <span id="graph-colour-by" className="text-sm text-muted-foreground">
            Colour by
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={filter.colour ?? "none"}
            onValueChange={(value) => value && onChange({ ...filter, colour: value === "none" ? null : (value as GraphFilter["colour"]) })}
            aria-labelledby="graph-colour-by"
          >
            <ToggleGroupItem value="none">None</ToggleGroupItem>
            <ToggleGroupItem value="tag">Tag</ToggleGroupItem>
            <ToggleGroupItem value="folder">Folder</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {filtering ? `${matching} of ${total} Items` : ""}
        </p>
        {filtering && (
          <Button variant="ghost" onClick={() => onChange({ ...filter, tags: [], type: null, linkedOnly: false })}>
            Clear filters
          </Button>
        )}
      </div>
      {tags.length > 0 && (
        <ToggleGroup
          type="multiple"
          value={filter.tags}
          onValueChange={(ids) => onChange({ ...filter, tags: ids })}
          aria-label="Filter by Tag"
          // shortcut: a very long list of Tags scrolls in two rows, add a search box if a real vault outgrows that.
          className="flex max-h-20 w-full flex-wrap justify-start gap-1 overflow-y-auto"
        >
          {tags.map((t) => (
            <ToggleGroupItem key={t.id} value={t.id} className="h-auto min-w-0 rounded-full px-1 py-0.5 aria-checked:ring-2 aria-checked:ring-ring aria-pressed:ring-2 aria-pressed:ring-ring">
              <TagBadge name={t.name} colour={t.colour} className="block max-w-40 truncate" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

function Legend({ legend, more }: { legend: { name: string; colour: TagColour; count: number }[]; more: number }) {
  if (legend.length === 0) return null;
  return (
    <ul aria-label="Colours" className="pointer-events-none absolute top-3 left-3 grid max-w-[60%] grid-cols-1 gap-1 overflow-hidden rounded-[10px] border border-border bg-popover p-2 text-xs">
      {legend.map((l) => (
        <li key={l.name} className="flex items-center gap-1.5">
          <span aria-hidden data-colour={l.colour} className="size-2.5 shrink-0 rounded-full bg-(--tag)" />
          <span className="min-w-0 truncate">{l.name}</span>
          <span className="text-muted-foreground">{l.count}</span>
        </li>
      ))}
      {more > 0 && <li className="text-muted-foreground">and {more} more</li>}
    </ul>
  );
}

// The same graph as rows, for anyone who can't or would rather not use the picture.
function GraphTable({ nodes, edges, tagNames }: { nodes: GraphNode[]; edges: GraphEdge[]; tagNames: Map<string, string[]> }) {
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
            <th scope="col" className="px-4 py-2 font-medium">Tags</th>
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
              <td className="px-4 py-2">{tagNames.get(n.id)?.join(", ") || "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
