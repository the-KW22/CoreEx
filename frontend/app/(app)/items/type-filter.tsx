import Link from "next/link";

import { listHref, type ItemType } from "@/lib/items";
import { cn } from "@/lib/utils";

const choices: { label: string; type?: ItemType }[] = [{ label: "All" }, { label: "Notes", type: "NOTE" }, { label: "Assets", type: "ASSET" }, { label: "Applications", type: "APPLICATION" }];

// All | Notes | Assets | Applications, as links so the choice is in the URL and survives paging and a reload.
export function TypeFilter({ path, type }: { path: string; type?: ItemType }) {
  return (
    <nav aria-label="Filter by type" className="flex gap-1">
      {choices.map((choice) => (
        <Link
          key={choice.label}
          href={listHref(path, 0, choice.type)}
          aria-current={choice.type === type ? "true" : undefined}
          className={cn(
            "inline-flex min-h-8 items-center rounded-full border border-border px-3 text-sm text-muted-foreground hover:text-foreground pointer-coarse:min-h-11",
            choice.type === type && "border-link bg-surface font-medium text-foreground",
          )}
        >
          {choice.label}
        </Link>
      ))}
    </nav>
  );
}
