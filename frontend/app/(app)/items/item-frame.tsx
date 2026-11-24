"use client";

import { ChevronRightIcon, PanelRightIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";

import { ConfirmTrash } from "@/components/confirm-trash";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Media queries for layout decisions made in code; the server renders as if none matches.
const media = (query: string) => ({
  subscribe: (change: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  },
  get: () => window.matchMedia(query).matches,
});
const wide = media("(min-width: 1280px)");
const tablet = media("(min-width: 768px)");

type Props = {
  crumbs: { href: string; label: string }[];
  /** The Item's own name, last in the breadcrumb. */
  current: string;
  /** Next to the buttons, such as a Note's save status. */
  status?: React.ReactNode;
  /** More header buttons, such as an Asset's Download. */
  extra?: React.ReactNode;
  trash: { id: string; action: (formData: FormData) => Promise<void> };
  /** The remembered Details choice, or null to follow the screen width. */
  detailsCookie: "open" | "closed" | null;
  details: React.ReactNode;
  children: React.ReactNode;
};

// The frame a Note and an Asset share (docs/DESIGN.md sections 6.3 and 6.4): a header bar and a Details panel,
// beside the page on tablets and up and a bottom Sheet on phones. The Details choice is kept in a cookie.
export function ItemFrame({ crumbs, current, status, extra, trash, detailsCookie, details, children }: Props) {
  const [detailsChoice, setDetailsChoice] = useState(detailsCookie);
  const [drawer, setDrawer] = useState(false);
  // The Trash confirm: the names it asks about, or null when closed. Confirming submits the hidden form.
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isWide = useSyncExternalStore(wide.subscribe, wide.get, () => false);
  const isTablet = useSyncExternalStore(tablet.subscribe, tablet.get, () => false);

  // The remembered choice, or open on wide screens.
  const detailsOpen = detailsChoice ? detailsChoice === "open" : isWide;
  function toggleDetails() {
    if (!isTablet) {
      setDrawer(true);
      return;
    }
    const next = detailsOpen ? "closed" : "open";
    setDetailsChoice(next);
    document.cookie = `details=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  // Each child of `details` is a section; a divider sits between them.
  // The body is one column that never grows past the panel, so a long title truncates instead of widening the page.
  const body = (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start divide-y divide-border-subtle [&>*]:py-5 [&>:first-child]:pt-0 [&>:last-child]:pb-0">
      {details}
    </div>
  );

  return (
    <div className="-mx-4 -mt-2 flex min-h-[calc(100dvh-4.5rem)] md:-m-8 md:min-h-dvh">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-14 z-30 flex items-center gap-2 border-b border-border bg-background px-4 py-2 md:top-0 md:px-8">
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1 overflow-hidden text-sm text-muted-foreground">
              {crumbs.map((crumb) => (
                <li key={crumb.href} className="flex min-w-0 items-center gap-1">
                  <Link href={crumb.href} className="truncate hover:text-foreground hover:underline">
                    {crumb.label}
                  </Link>
                  <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />
                </li>
              ))}
              <li aria-current="page" className="truncate text-foreground">
                {current}
              </li>
            </ol>
          </nav>
          {status}
          {extra}
          <form ref={formRef} action={trash.action}>
            <input type="hidden" name="id" value={trash.id} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" onClick={() => setConfirming([current])} aria-label="Move to Trash">
                  <Trash2Icon aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move to Trash</TooltipContent>
            </Tooltip>
          </form>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleDetails}
                aria-label="Details"
                aria-expanded={isTablet ? detailsOpen : drawer}
              >
                <PanelRightIcon aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{detailsOpen ? "Hide details" : "Show details"}</TooltipContent>
          </Tooltip>
        </header>
        {children}
      </div>

      {/* Tablets and up: a panel beside the page. With no choice made, it follows the screen width.
          It is the rightmost thing on screen, so anything wider than it scrolls inside it rather than widening the page. */}
      <aside
        aria-label="Details"
        className={`w-72 min-w-0 shrink-0 overflow-x-auto border-l border-border bg-panel p-5 max-md:hidden ${
          detailsChoice === null ? "hidden xl:block" : detailsOpen ? "md:block" : "hidden"
        }`}
      >
        {body}
      </aside>
      {/* Phones: a bottom Sheet. */}
      <Sheet open={drawer && !isTablet} onOpenChange={setDrawer}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto border-border bg-panel p-5">
          <SheetTitle>Details</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
      <ConfirmTrash
        names={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          formRef.current?.requestSubmit();
          setConfirming(null);
        }}
      />
    </div>
  );
}
