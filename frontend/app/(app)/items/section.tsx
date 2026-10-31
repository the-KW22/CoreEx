"use client";

import { ChevronDownIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { withCollapsed } from "@/lib/prefs";

// A section of an Items page (Folders, Items) that the User can fold away. The state is kept in the `collapsed`
// cookie, which the server reads, so a folded section stays folded after a reload.
export function Section({
  id,
  heading,
  open,
  children,
}: {
  id: string;
  /** The heading's content: its text, and a count if there is one. */
  heading: React.ReactNode;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={open}
      onOpenChange={(isOpen) => {
        const current = /(?:^|; )collapsed=([^;]*)/.exec(document.cookie)?.[1];
        document.cookie = `collapsed=${withCollapsed(current, id, !isOpen)}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="grid gap-3"
    >
      <h2 className="text-sm font-semibold text-muted-foreground">
        <CollapsibleTrigger className="group -ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground pointer-coarse:min-h-11">
          <ChevronDownIcon aria-hidden className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
          {heading}
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="grid gap-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
