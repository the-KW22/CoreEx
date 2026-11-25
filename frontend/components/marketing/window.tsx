import { BriefcaseBusinessIcon, FilesIcon, HouseIcon, LibraryIcon, MessagesSquareIcon, WaypointsIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// The product window of the marketing page: a live mockup built from the app's tokens (docs/DESIGN.md 3.1), so it stays
// sharp and follows the theme. It is decoration: the copy beside it says the same in words, so it is hidden from
// assistive technology.
const RAIL = [
  { id: "home", Icon: HouseIcon },
  { id: "kb", Icon: LibraryIcon },
  { id: "assets", Icon: FilesIcon },
  { id: "graph", Icon: WaypointsIcon },
  { id: "career", Icon: BriefcaseBusinessIcon },
  { id: "chat", Icon: MessagesSquareIcon },
] as const;
export type RailId = (typeof RAIL)[number]["id"];

export function AppWindow({ active, title, children, className }: { active: RailId; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("flex aspect-[16/11] w-full overflow-hidden rounded-[18px] border border-border bg-background text-left shadow-2xl shadow-black/20", className)}>
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-3 sm:w-14">
        <span className="mb-2 grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">C</span>
        {RAIL.map(({ id, Icon }) => (
          <span key={id} className={cn("grid size-8 place-items-center rounded-lg", id === active ? "bg-surface text-foreground" : "text-muted-foreground")}>
            <Icon className="size-4" />
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center border-b border-border px-4 text-xs font-semibold">{title}</div>
        <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
