"use client";

import { FilesIcon, HouseIcon, LibraryIcon, PanelLeftCloseIcon, PanelLeftIcon, PanelLeftOpenIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

// The same entry as a row with its label beside the icon, or just the icon when the rail is collapsed.
const entry = (collapsed: boolean) =>
  collapsed ? railButton : cn(railButton, "flex w-full items-center justify-start gap-3 px-2.5 text-sm font-medium");

const MODULES: { id: Module; href: string; label: string; icon: typeof HouseIcon }[] = [
  { id: "home", href: "/", label: "Home", icon: HouseIcon },
  { id: "kb", href: "/items", label: "Knowledge Base", icon: LibraryIcon },
  { id: "assets", href: "/assets", label: "Assets", icon: FilesIcon },
];

// A Tooltip only when the label is not already on screen.
function Hint({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailLink({
  href,
  label,
  icon: Icon,
  current,
  collapsed,
}: {
  href: string;
  label: string;
  icon: typeof HouseIcon;
  current: boolean;
  collapsed: boolean;
}) {
  return (
    <Hint label={label} show={collapsed}>
      <Link
        href={href}
        aria-label={label}
        aria-current={current ? "page" : undefined}
        className={cn(entry(collapsed), current && "bg-surface text-foreground")}
      >
        <Icon aria-hidden />
        {!collapsed && label}
      </Link>
    </Hint>
  );
}

// The module rail: every module of CoreEx, then the account. Labels show beside the icons unless the User collapsed the
// rail (remembered in the `rail` cookie). `collapsed` is the saved choice; leave it out where the rail cannot collapse
// (the phone menu). `onShowPanel` adds the button that opens the Knowledge Base panel on screens too narrow to show it
// beside the rail.
export function Rail({
  email,
  isAdmin,
  collapsed: saved,
  onShowPanel,
}: {
  email: string;
  isAdmin: boolean;
  collapsed?: boolean;
  onShowPanel?: (button: HTMLElement) => void;
}) {
  const active = activeModule(usePathname());
  const [choice, setChoice] = useState(saved);
  const collapsed = choice ?? false;
  function toggle() {
    setChoice(!collapsed);
    document.cookie = `rail=${collapsed ? "expanded" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
  }
  const toggleLabel = collapsed ? "Expand the menu" : "Collapse the menu";
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex h-full flex-col gap-1 border-r border-border bg-background py-3",
        collapsed ? "w-16 items-center" : "w-56 px-3",
      )}
    >
      <div className={cn("mb-3 flex items-center gap-3", !collapsed && "px-1")}>
        <span aria-hidden className="grid size-9 place-items-center rounded-[10px] bg-primary font-bold text-primary-foreground">
          C
        </span>
        {!collapsed && <span className="font-semibold">CoreEx</span>}
      </div>
      {MODULES.map((m) => (
        <RailLink key={m.id} {...m} current={active === m.id} collapsed={collapsed} />
      ))}
      {/* Only the Knowledge Base has a panel to open. */}
      {onShowPanel && active === "kb" && (
        <Hint label="Show the Knowledge Base panel" show={collapsed}>
          <button
            type="button"
            onClick={(e) => onShowPanel(e.currentTarget)}
            aria-label="Show the Knowledge Base panel"
            className={cn(entry(collapsed), "xl:hidden")}
          >
            <PanelLeftIcon aria-hidden />
            {!collapsed && "Panel"}
          </button>
        </Hint>
      )}
      <hr className={cn("my-2 border-border-subtle", collapsed ? "w-8" : "w-full")} />
      <RailLink href="/trash" label="Trash" icon={Trash2Icon} current={active === "trash"} collapsed={collapsed} />
      {/* Only a convenience: the API refuses non-admins on its own (ADR 0004). */}
      {isAdmin && <RailLink href="/admin" label="Admin" icon={ShieldIcon} current={active === "admin"} collapsed={collapsed} />}

      <div className={cn("mt-auto flex flex-col gap-1", collapsed ? "items-center" : "items-stretch")}>
        {saved !== undefined && (
          <Hint label={toggleLabel} show={collapsed}>
            <button type="button" onClick={toggle} aria-label={toggleLabel} className={entry(collapsed)}>
              <ToggleIcon aria-hidden />
              {!collapsed && "Collapse the menu"}
            </button>
          </Hint>
        )}
        <Hint label="Theme" show={collapsed}>
          <ThemeToggle className={entry(collapsed)}>{!collapsed && "Theme"}</ThemeToggle>
        </Hint>
        <DropdownMenu>
          <Hint label="Account" show={collapsed}>
            <DropdownMenuTrigger
              // Expanded, the name is the visible "Account" (a different aria-label fails axe's label-in-name check
              // because it counts the avatar's initial as visible text); the email is the first line of the menu.
              aria-label={collapsed ? `Account: ${email}` : undefined}
              className={cn(
                collapsed
                  ? "grid size-9 place-items-center rounded-full border border-border bg-surface text-sm font-semibold uppercase text-foreground pointer-coarse:size-11"
                  : cn(entry(false), "px-1.5"),
              )}
            >
              {collapsed ? (
                email.charAt(0)
              ) : (
                <>
                  <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-xs font-semibold uppercase text-foreground">
                    {email.charAt(0)}
                  </span>
                  Account
                </>
              )}
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
