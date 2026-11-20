"use client";

import { LayoutGridIcon, ListIcon, WaypointsIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ItemsView } from "@/lib/prefs";

import { chooseView, useView } from "./view-state";

// Grid | List | Graph, in the page header. Graph is a page of its own (`graphHref`); on that page `saved` is "graph"
// and choosing Grid or List goes back to `listHref`.
export function ViewToggle({
  saved,
  graphHref,
  listHref,
}: {
  saved: ItemsView | "graph";
  graphHref?: string;
  listHref?: string;
}) {
  const router = useRouter();
  const view = useView(saved === "graph" ? "grid" : saved);
  // What is shown now: the saved first paint changes only on navigation, so compare with this, not with `saved`.
  const shown = saved === "graph" ? "graph" : view;
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={shown}
      onValueChange={(value) => {
        if (!value || value === shown) return;
        if (value === "graph") {
          if (graphHref) router.push(graphHref);
          return;
        }
        chooseView(value as ItemsView);
        if (listHref) router.push(listHref);
      }}
      aria-label="View"
    >
      <ToggleGroupItem value="grid" aria-label="Grid" className="pointer-coarse:size-11">
        <LayoutGridIcon aria-hidden />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List" className="pointer-coarse:size-11">
        <ListIcon aria-hidden />
      </ToggleGroupItem>
      {(graphHref || saved === "graph") && (
        <ToggleGroupItem value="graph" aria-label="Graph" className="pointer-coarse:size-11">
          <WaypointsIcon aria-hidden />
        </ToggleGroupItem>
      )}
    </ToggleGroup>
  );
}
