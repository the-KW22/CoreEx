"use client";

import { HouseIcon, LibraryIcon, PanelLeftIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { activeModule, type Module } from "@/lib/modules";
import { cn } from "@/lib/utils";

import { signOut } from "../actions";

// 40px targets, 44px on touch screens (docs/DESIGN.md section 8).
export const railButton = cn(
  "grid size-10 place-items-center rounded-[10px] text-muted-foreground transition-colors pointer-coarse:size-11",
  "hover:bg-surface hover:text-foreground [&_svg]:size-5",
);

// shortcut: Knowledge Base opens today's Item list at "/" until /items lands (#55), then point it there.
const MODULES: { id: Module; href: string; label: string; icon: typeof HouseIcon }[] = [
  { id: "home", href: "/", label: "Home", icon: HouseIcon },
  { id: "kb", href: "/", label: "Knowledge Base", icon: LibraryIcon },
];

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailLink({ href, label, icon: Icon, current }: { href: string; label: string; icon: typeof HouseIcon; current: boolean }) {
  return (
    <Hint label={label}>
      <Link
        href={href}
        aria-label={label}
        aria-current={current ? "page" : undefined}
        className={cn(railButton, current && "bg-surface text-foreground")}
      >
        <Icon aria-hidden />
      </Link>
    </Hint>
  );
}

// The module rail: every module of CoreEx, then the account. `onShowPanel` adds the button that opens the
// Knowledge Base panel on screens too narrow to show it beside the rail.
export function Rail({ email, isAdmin, onShowPanel }: { email: string; isAdmin: boolean; onShowPanel?: (button: HTMLElement) => void }) {
  const active = activeModule(usePathname());
  return (
    <nav aria-label="Main" className="flex h-full w-16 flex-col items-center gap-1 border-r border-border bg-background py-3">
      <span aria-hidden className="mb-3 grid size-9 place-items-center rounded-[10px] bg-primary font-bold text-primary-foreground">
        C
      </span>
      {MODULES.map((m) => (
        <RailLink key={m.id} {...m} current={active === m.id} />
      ))}
      {onShowPanel && (
        <Hint label="Show the Knowledge Base panel">
          <button type="button" onClick={(e) => onShowPanel(e.currentTarget)} aria-label="Show the Knowledge Base panel" className={cn(railButton, "xl:hidden")}>
            <PanelLeftIcon aria-hidden />
          </button>
        </Hint>
      )}
      <hr className="my-2 w-8 border-border-subtle" />
      <RailLink href="/trash" label="Trash" icon={Trash2Icon} current={active === "trash"} />
      {/* Only a convenience: the API refuses non-admins on its own (ADR 0004). */}
      {isAdmin && <RailLink href="/admin" label="Admin" icon={ShieldIcon} current={active === "admin"} />}

      <div className="mt-auto flex flex-col items-center gap-1">
        <Hint label="Theme">
          <ThemeToggle className={railButton} />
        </Hint>
        <DropdownMenu>
          <Hint label="Account">
            <DropdownMenuTrigger
              aria-label={`Account: ${email}`}
              className="grid size-9 place-items-center rounded-full border border-border bg-surface text-sm font-semibold uppercase text-foreground pointer-coarse:size-11"
            >
              {email.charAt(0)}
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent side="right" align="end" className="min-w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut()}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
