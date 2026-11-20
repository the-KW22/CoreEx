"use client";

import { FolderTreeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TagBadge } from "@/components/tag-badge";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { components } from "@/lib/api/schema";
import { graphFolderChoices, type Folder } from "@/lib/folders";
import {
  aroundNode,
  findNodes,
  linkedOnly,
  matchesFilter,
  nodeColours,
  readFilter,
  writeFilter,
  type GraphEdge,
  type GraphFilter,
  type GraphNode,
  type GraphTag,
  type SuggestedLink,
} from "@/lib/graph";
import { graphHref, startCollapsed, treeGraph, type GraphMode } from "@/lib/graph-tree";
import type { TagColour } from "@/lib/tag-colour";

import { FolderSelect } from "../folders/folder-select";
import { loadNeighbours, loadSuggestions, resetLayout, savePosition } from "./actions";
import { GraphCanvas } from "./graph-canvas";
import { GraphFolders } from "./graph-folders";

/** What is lit in the canvas: which Find or Item it came from, and the Items in it. */
type Highlight = { key: string; ids: string[] };

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
  // What Load neighbours has added to the graph from the server. Each Item's neighbours are asked for once.
  const [added, setAdded] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; asked: Set<string> }>({ nodes: [], edges: [], asked: new Set() });
  const [expanding, startExpanding] = useTransition();
  // A refresh can bring in what was added by hand, as the page's own data: that copy wins.
  const allNodes = useMemo(() => {
    const own = new Set(graph.nodes.map((n) => n.id));
    return [...graph.nodes, ...added.nodes.filter((n) => !own.has(n.id))].map((n) => ({ ...n, title: n.title || "Untitled" }));
  }, [graph.nodes, added.nodes]);
  const allEdges = useMemo(() => {
    const own = new Set(graph.edges.map((e) => `${e.source} ${e.target}`));
    return [...graph.edges, ...added.edges.filter((e) => !own.has(`${e.source} ${e.target}`))];
  }, [graph.edges, added.edges]);
  const asked = useMemo(() => readFilter(params), [params]);
  // A Tag from another Folder's graph (the filter follows the User between Folders) cannot match here, so it is ignored.
  const filter = useMemo(
    () => ({ ...asked, tags: asked.tags.filter((id) => graph.tags.some((t) => t.id === id)) }),
    [asked, graph.tags],
  );
  // Tree mode draws Folders rather than Links, so Only linked Items waits in the address for the way back.
  const hideUnlinked = filter.linkedOnly && mode === "links";
  const { nodes, edges } = useMemo(
    () => (hideUnlinked ? linkedOnly(allNodes, allEdges) : { nodes: allNodes, edges: allEdges }),
    [allNodes, allEdges, hideUnlinked],
  );
  const dimmed = useMemo(() => new Set(nodes.filter((n) => !matchesFilter(n, filter)).map((n) => n.id)), [nodes, filter]);
  const painted = useMemo(() => (filter.colour ? nodeColours(nodes, graph.tags, filter.colour) : null), [nodes, graph.tags, filter.colour]);
  const tagNames = useMemo(() => {
    const names = new Map(graph.tags.map((t) => [t.id, t.name]));
    return new Map(nodes.map((n) => [n.id, n.tagIds.map((id) => names.get(id)!).filter(Boolean)]));
  }, [nodes, graph.tags]);
  const [panel, setPanel] = useState(panelOpen);
  const [sheet, setSheet] = useState(false);
  // ?focus= comes from Show in Graph in the palette.
  const focusParam = params.get("focus");
  const [focusOn, setFocusOn] = useState(() => (focusParam ? { id: focusParam, move: false } : null));
  const [highlight, setHighlight] = useState<Highlight | null>(() =>
    focusParam ? { key: `find:${focusParam}`, ids: aroundNode(focusParam, graph.edges) } : null,
  );
  // Stays until the User clicks away, presses Escape or chooses another.
  function find(id: string) {
    setHighlight({ key: `find:${id}`, ids: aroundNode(id, edges) });
    setFocusOn({ id, move: true });
  }
  // An added Item shows as a stub (dashed): it is outside what this view would hold by itself.
  // shortcut: only the Links of the Item asked about come back, so a Link between two added Items shows once one of them
  // is asked about too; load depth 2 or the edges among all shown if that confuses anyone.
  function expand(id: string) {
    startExpanding(async () => {
      const result = await loadNeighbours(id);
      if (!result) {
        toast.error("Could not load the neighbours. Try again.");
        return;
      }
      const known = new Set(allNodes.map((n) => n.id));
      const links = new Set(allEdges.map((e) => `${e.source} ${e.target}`));
      const nodes = result.nodes.filter((n) => !known.has(n.id)).map((n) => ({ ...n, stub: true }));
      setAdded((was) => ({
        nodes: [...was.nodes, ...nodes],
        edges: [...was.edges, ...result.edges.filter((e) => !links.has(`${e.source} ${e.target}`))],
        asked: new Set(was.asked).add(id),
      }));
      setHighlight({ key: `find:${id}`, ids: result.nodes.map((n) => n.id) });
      toast(nodes.length ? `Added ${nodes.length} ${nodes.length === 1 ? "Item" : "Items"}.` : "Nothing more is linked to it.");
    });
  }
  const canExpand = (id: string) =>
    !added.asked.has(id) && (graph.truncated || !!allNodes.find((n) => n.id === id)?.stub);
  const findBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.matches("input, textarea, select") || target.isContentEditable;
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        findBox.current?.focus();
      } else if (e.key === "Escape") {
        setHighlight(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // What Similar shows: asked for only when it is on, and again when the graph changes (a Link it refreshes the page).
  const [pairs, setPairs] = useState<{ graph: unknown; items: SuggestedLink[] | null } | null>(null);
  const wantsSimilar = filter.similar && mode === "links";
  useEffect(() => {
    if (!wantsSimilar) return;
    let current = true;
    loadSuggestions(folderId).then((items) => {
      if (current) setPairs({ graph, items });
    });
    return () => {
      current = false;
    };
  }, [wantsSimilar, folderId, graph]);
  const similar = wantsSimilar ? pairs?.items : undefined;
  const href = (id: string | null) => graphHref(id, mode, filter);
  // In the address only: nothing needs fetching again, so the page does not go back to the server.
  function setFilter(next: GraphFilter) {
    const query = new URLSearchParams(params);
    writeFilter(query, next);
    const text = query.toString();
    window.history.replaceState(null, "", text ? `/graph?${text}` : "/graph");
    setHighlight(null);
    setFocusOn(null);
  }
  function togglePanel() {
    setPanel(!panel);
    document.cookie = `graph-panel=${panel ? "closed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }
  // Tree mode also draws Folders with nothing in them yet.
  const hasFolders = folders.some((f) => f.parentId === folderId);
  const empty = allNodes.length === 0 && !(mode === "tree" && hasFolders);

  const listHref = folderId ? `/folders/${folderId}` : "/items";
  const missing = focusParam && !nodes.some((n) => n.id === focusParam);
  const columns = panel ? "md:grid-cols-[16rem_minmax(0,1fr)]" : "";
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
          {mode === "links" && allNodes.length > 0 && <GraphFind nodes={nodes} inputRef={findBox} big={graph.truncated} onFind={find} />}
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
        </div>
      </header>

      {graph.truncated && (
        <Alert role="status" tone="neutral">
          Showing {graph.nodes.length} of {graph.total} Items. Open a smaller Folder to see them all, or load a node&rsquo;s neighbours.
        </Alert>
      )}

      {missing && allNodes.length > 0 && (
        <Alert role="status" tone="neutral">
          That Item is not in this view. It may be filtered out, in another Folder, or past the first 500.
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
          similarCount={similar?.length ?? null}
          similarFailed={wantsSimilar && pairs?.items === null}
        />
      )}

      <div className={`grid gap-4 ${columns}`}>
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
            highlight={highlight?.ids}
            focusOn={focusOn}
            expand={{ can: canExpand, run: expand, busy: expanding }}
            similar={similar ?? undefined}
            onBackgroundClick={() => setHighlight(null)}
            label={`Graph of ${scope}: ${nodes.length} Items. Tab to an Item, arrow keys move along its Links, E loads its neighbours where there may be more.`}
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

// Finds a node among those loaded, as the palette finds an Item. The list is also a text way to reach any node.
function GraphFind({
  nodes,
  inputRef,
  big,
  onFind,
}: {
  nodes: GraphNode[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  big: boolean;
  onFind: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const hits = findNodes(nodes, text);
  return (
    <Command shouldFilter={false} className="relative h-9 w-full overflow-visible rounded-md border border-border bg-transparent sm:w-56">
      <CommandInput
        ref={inputRef}
        value={text}
        onValueChange={setText}
        onKeyDown={(e) => e.key === "Escape" && setText("")}
        placeholder="Find an Item  /"
        aria-label="Find an Item in the graph"
        maxLength={200}
        className="h-9"
      />
      {/* Always there, hidden when empty: the input's aria-controls must point at something. */}
      <CommandList hidden={!text.trim()} className="absolute top-full right-0 left-0 z-20 mt-1 rounded-[10px] border border-border bg-popover p-1 shadow-lg">
        <CommandEmpty className="px-2 py-3 text-sm text-muted-foreground">
          Nothing here has that title.{big ? " Only the first 500 Items are loaded." : ""}
        </CommandEmpty>
        {hits.map((n) => (
          <CommandItem
            key={n.id}
            value={n.id}
            onSelect={() => {
              setText("");
              onFind(n.id);
            }}
          >
            <span className="truncate">{n.title}</span>
            {n.folderPath && <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{n.folderPath}</span>}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

function GraphFilters({
  filter,
  tags,
  mode,
  matching,
  total,
  onChange,
  similarCount,
  similarFailed,
}: {
  filter: GraphFilter;
  tags: GraphTag[];
  mode: GraphMode;
  matching: number;
  total: number;
  onChange: (filter: GraphFilter) => void;
  similarCount: number | null;
  similarFailed: boolean;
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
          <ToggleGroupItem value="APPLICATION">Applications</ToggleGroupItem>
          <ToggleGroupItem value="RESUME">Resumes</ToggleGroupItem>
          <ToggleGroupItem value="COVER_LETTER">Cover Letters</ToggleGroupItem>
        </ToggleGroup>
        {mode === "links" && (
          <Toggle variant="outline" pressed={filter.linkedOnly} onPressedChange={(linkedOnly) => onChange({ ...filter, linkedOnly })}>
            Only linked Items
          </Toggle>
        )}
        {mode === "links" && (
          <Toggle variant="outline" pressed={filter.similar} onPressedChange={(similar) => onChange({ ...filter, similar })}>
            Similar
          </Toggle>
        )}
        {mode === "links" && filter.similar && (
          <p role="status" className="text-sm text-muted-foreground">
            {similarFailed
              ? "Could not load similar Notes."
              : similarCount === null
                ? "Looking for similar Notes…"
                : similarCount === 0
                  ? "No similar Notes yet. New Notes take a few minutes to be read."
                  : `${similarCount} similar ${similarCount === 1 ? "pair" : "pairs"}, shown as dotted lines. They are suggestions, not Links.`}
          </p>
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
