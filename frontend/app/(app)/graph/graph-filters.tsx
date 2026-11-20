"use client";

import { CheckIcon, FilterIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TagBadge } from "@/components/tag-badge";
import { typeName, type GraphFilter, type GraphTag } from "@/lib/graph";
import type { GraphMode } from "@/lib/graph-tree";

const TYPES: NonNullable<GraphFilter["type"]>[] = ["NOTE", "ASSET", "APPLICATION", "RESUME", "COVER_LETTER"];
const ALL = "__all__";

type Props = {
  filter: GraphFilter;
  tags: GraphTag[];
  mode: GraphMode;
  onChange: (filter: GraphFilter) => void;
};

// Everything that narrows or paints the graph, in one place: Type, Tags (searchable), Only linked Items, Similar and Colour by.
function FilterForm({ filter, tags, mode, onChange }: Props) {
  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-1.5">
        <span id="graph-filter-type" className="font-medium">Type</span>
        <select
          aria-labelledby="graph-filter-type"
          value={filter.type ?? ALL}
          onChange={(event) => onChange({ ...filter, type: event.target.value === ALL ? null : (event.target.value as GraphFilter["type"]) })}
          className="flex h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value={ALL}>All types</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {typeName(type)}
            </option>
          ))}
        </select>
      </div>

      {tags.length > 0 && (
        <div className="grid gap-1.5">
          <span id="graph-filter-tags" className="font-medium">Tags</span>
          <Command aria-labelledby="graph-filter-tags" className="rounded-md border border-border bg-transparent">
            <CommandInput placeholder="Find a Tag" aria-label="Find a Tag" maxLength={50} />
            <CommandList className="max-h-40">
              <CommandEmpty className="px-2 py-3 text-sm text-muted-foreground">No Tag has that name.</CommandEmpty>
              {tags.map((tag) => {
                const on = filter.tags.includes(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    data-checked={on}
                    aria-selected={on}
                    onSelect={() => onChange({ ...filter, tags: on ? filter.tags.filter((id) => id !== tag.id) : [...filter.tags, tag.id] })}
                  >
                    <CheckIcon aria-hidden className={on ? "size-4" : "size-4 opacity-0"} />
                    <TagBadge name={tag.name} colour={tag.colour} className="max-w-48 truncate" />
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </div>
      )}

      {mode === "links" && (
        <>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filter.linkedOnly}
              onChange={(event) => onChange({ ...filter, linkedOnly: event.target.checked })}
              className="size-4 accent-primary"
            />
            Only linked Items
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filter.similar}
              onChange={(event) => onChange({ ...filter, similar: event.target.checked })}
              className="size-4 accent-primary"
            />
            Similar
          </label>
        </>
      )}

      <div className="grid gap-1.5">
        <span id="graph-colour-by" className="font-medium">Colour by</span>
        <select
          aria-labelledby="graph-colour-by"
          value={filter.colour ?? "none"}
          onChange={(event) => onChange({ ...filter, colour: event.target.value === "none" ? null : (event.target.value as GraphFilter["colour"]) })}
          className="flex h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="none">None</option>
          <option value="tag">Tag</option>
          <option value="folder">Folder</option>
        </select>
      </div>
    </div>
  );
}

// The active choices as small chips, each removable, with how many Items match and a way to clear them all.
export function ActiveFilters({
  filter,
  tags,
  mode,
  matching,
  total,
  onChange,
  similarNote,
}: Props & { matching: number; total: number; similarNote: string | null }) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filter.type) chips.push({ key: "type", label: typeName(filter.type), remove: () => onChange({ ...filter, type: null }) });
  for (const id of filter.tags) {
    const tag = tags.find((t) => t.id === id);
    if (tag) chips.push({ key: `tag-${id}`, label: tag.name, remove: () => onChange({ ...filter, tags: filter.tags.filter((t) => t !== id) }) });
  }
  if (mode === "links" && filter.linkedOnly) chips.push({ key: "linked", label: "Only linked Items", remove: () => onChange({ ...filter, linkedOnly: false }) });
  if (mode === "links" && filter.similar) chips.push({ key: "similar", label: "Similar", remove: () => onChange({ ...filter, similar: false }) });
  if (filter.colour) chips.push({ key: "colour", label: `Colour by ${filter.colour === "tag" ? "Tag" : "Folder"}`, remove: () => onChange({ ...filter, colour: null }) });
  const narrowing = chips.some((chip) => chip.key !== "colour" && chip.key !== "similar");
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <li key={chip.key}>
            <button
              type="button"
              onClick={chip.remove}
              aria-label={`Remove filter: ${chip.label}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium hover:bg-surface-raised"
            >
              <span className="max-w-40 truncate">{chip.label}</span>
              <XIcon aria-hidden className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" onClick={() => onChange({ ...filter, tags: [], type: null, linkedOnly: false, similar: false, colour: null })}>
        Clear filters
      </Button>
      <p role="status" className="text-muted-foreground">
        {[narrowing ? `${matching} of ${total} Items` : "", similarNote ?? ""].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

// The Filters button in the toolbar: a Popover, or a Sheet on phones.
export function FiltersButton({ filter, tags, mode, onChange }: Props) {
  const [sheet, setSheet] = useState(false);
  const active =
    filter.tags.length + (filter.type ? 1 : 0) + (mode === "links" && filter.linkedOnly ? 1 : 0) + (mode === "links" && filter.similar ? 1 : 0) + (filter.colour ? 1 : 0);
  const label = (
    <>
      <FilterIcon aria-hidden />
      Filters{active > 0 ? ` (${active})` : ""}
    </>
  );
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="hidden md:inline-flex">
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
          <FilterForm filter={filter} tags={tags} mode={mode} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <Button variant="outline" className="md:hidden" onClick={() => setSheet(true)}>
        {label}
      </Button>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="right" className="w-80 max-w-full overflow-y-auto border-border bg-panel p-4">
          <SheetTitle>Filters</SheetTitle>
          <FilterForm filter={filter} tags={tags} mode={mode} onChange={onChange} />
        </SheetContent>
      </Sheet>
    </>
  );
}
