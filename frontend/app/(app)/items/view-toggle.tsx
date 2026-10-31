"use client";

import { LayoutGridIcon, ListIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ItemsView } from "@/lib/prefs";

import { chooseView, useView } from "./view-state";

// Grid | List, in the page header.
export function ViewToggle({ saved }: { saved: ItemsView }) {
  const view = useView(saved);
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={view}
      onValueChange={(value) => value && chooseView(value as ItemsView)}
      aria-label="View"
    >
      <ToggleGroupItem value="grid" aria-label="Grid" className="pointer-coarse:size-11">
        <LayoutGridIcon aria-hidden />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List" className="pointer-coarse:size-11">
        <ListIcon aria-hidden />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
