"use client";

import { CommandIcon, MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Folder } from "@/lib/folders";
import { activeModule } from "@/lib/modules";
import type { RailState } from "@/lib/prefs";
import type { TagColour } from "@/lib/tag-colour";

import { CareerPanel } from "./career/career-panel";
import { KbPanel } from "./kb-panel";
import { Rail, railButton } from "./rail";
import { Uploads } from "./assets/uploads";
import { CommandPalette, openPalette } from "./search/command-palette";

type Props = {
  email: string;
  isAdmin: boolean;
  /** The rail's saved width and collapsed state. */
  rail: RailState;
  folders: Folder[] | null;
  tags: { id: string; name: string; colour?: TagColour | null }[] | null;
  children: React.ReactNode;
};

// The layout around every signed-in page (docs/DESIGN.md section 8):
// ≥ 768px one sidebar: the rail, which shows the Knowledge Base or Career panel in its place. < 768px a top bar and the
// same sidebar in a Sheet. A collapsed rail opens the panel in a Sheet.
export function AppFrame({ email, isAdmin, rail, folders, tags, children }: Props) {
  const pathname = usePathname();
  // The Knowledge Base and Career each have a panel; every other module's pages get the whole width.
  const current = activeModule(pathname);
  const showPanel = current === "kb" || current === "career";
  const panelName = current === "career" ? "Career" : "Knowledge Base";
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

  const panel = current === "career" ? <CareerPanel /> : <KbPanel folders={folders} tags={tags} />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh">
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background px-2 md:hidden">
          <button type="button" onClick={(e) => show("menu", e.currentTarget)} aria-label="Open the menu" className={railButton}>
            <MenuIcon aria-hidden />
          </button>
          <span className="flex-1 font-semibold">CoreEx</span>
          <button type="button" onClick={openPalette} aria-label="Quick find" className={railButton}>
            <CommandIcon aria-hidden />
          </button>
        </header>

        <div className="sticky top-0 hidden h-dvh shrink-0 md:block">
          <Rail email={email} isAdmin={isAdmin} saved={rail} panel={showPanel ? panel : undefined} onShowPanel={(button) => show("panel", button)} />
        </div>

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
          <SheetTitle className="sr-only">{sheet?.kind === "menu" ? "Menu" : panelName}</SheetTitle>
          <div className="flex h-full min-w-0">
            {sheet?.kind === "menu" ? (
              <Rail email={email} isAdmin={isAdmin} panel={showPanel ? panel : undefined} />
            ) : (
              <div className="w-72 min-w-0 max-w-full">{panel}</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <CommandPalette />
      <Uploads folders={folders} />
      <Toaster />
    </TooltipProvider>
  );
}
