"use client";

import { MenuIcon, SearchIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Folder } from "@/lib/folders";

import { KbPanel } from "./kb-panel";
import { Rail, railButton } from "./rail";
import { Uploads } from "./assets/uploads";
import { CommandPalette, openPalette } from "./search/command-palette";

type Props = {
  email: string;
  isAdmin: boolean;
  folders: Folder[] | null;
  tags: { id: string; name: string }[] | null;
  children: React.ReactNode;
};

// The layout around every signed-in page (docs/DESIGN.md section 8):
// ≥ 1280px rail + panel; 768–1279px rail, panel in a Sheet; < 768px top bar, rail + panel in a Sheet.
export function AppFrame({ email, isAdmin, folders, tags, children }: Props) {
  const pathname = usePathname();
  // Which Sheet is open, and on which page: following a link inside it closes it.
  const [sheet, setSheet] = useState<{ kind: "menu" | "panel"; at: string } | null>(null);
  const open = sheet?.at === pathname;
  // Two buttons open the one Sheet, so remember which, to give focus back to it on close.
  const opener = useRef<HTMLElement>(null);
  const show = (kind: "menu" | "panel", button: HTMLElement) => {
    opener.current = button;
    setSheet({ kind, at: pathname });
  };
  // Keeps `kind` so the Sheet's content stays the same while it slides out.
  const onOpenChange = (isOpen: boolean) => !isOpen && setSheet((s) => s && { ...s, at: "" });

  const panel = <KbPanel folders={folders} tags={tags} />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh">
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background px-2 md:hidden">
          <button type="button" onClick={(e) => show("menu", e.currentTarget)} aria-label="Open the menu" className={railButton}>
            <MenuIcon aria-hidden />
          </button>
          <span className="flex-1 font-semibold">CoreEx</span>
          <button type="button" onClick={openPalette} aria-label="Search" className={railButton}>
            <SearchIcon aria-hidden />
          </button>
        </header>

        <div className="sticky top-0 hidden h-dvh shrink-0 md:block">
          <Rail email={email} isAdmin={isAdmin} onShowPanel={(button) => show("panel", button)} />
        </div>
        <aside aria-label="Knowledge Base" className="sticky top-0 hidden h-dvh shrink-0 xl:block">
          {panel}
        </aside>

        <main className="min-w-0 flex-1 px-4 pt-18 pb-8 md:p-8">{children}</main>
      </div>

      <Sheet open={open} onOpenChange={onOpenChange}>
        {/* pt-10 leaves room for the Sheet's close button above the panel header. */}
        <SheetContent
          side="left"
          className="w-auto max-w-[calc(100vw-3rem)] gap-0 border-border bg-panel p-0 pt-10 outline-none sm:max-w-none"
          // Focus the Sheet itself: the first button would open its Tooltip, which then takes the first Escape.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
        >
          <SheetTitle className="sr-only">{sheet?.kind === "menu" ? "Menu" : "Knowledge Base"}</SheetTitle>
          <div className="flex h-full min-w-0">
            {sheet?.kind === "menu" && <Rail email={email} isAdmin={isAdmin} />}
            <div className="min-w-0 flex-1">{panel}</div>
          </div>
        </SheetContent>
      </Sheet>
      <CommandPalette />
      <Uploads folders={folders} />
      <Toaster />
    </TooltipProvider>
  );
}
