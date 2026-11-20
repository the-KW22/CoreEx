"use client";

import {
  BookOpenIcon,
  BriefcaseBusinessIcon,
  ChevronLeftIcon,
  CommandIcon,
  FilesIcon,
  HouseIcon,
  WaypointsIcon,
  LibraryIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  ShieldIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { RAIL_COLLAPSED, RAIL_MAX, dragRail, formatRail, keyRail, type RailState } from "@/lib/prefs";
import { cn } from "@/lib/utils";

import { signOut } from "../actions";
import { clearAllUnsaved } from "./notes/[id]/recovery";
import { openPalette } from "./search/command-palette";

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
  { id: "graph", href: "/graph", label: "Graph", icon: WaypointsIcon },
  { id: "career", href: "/career", label: "Career", icon: BriefcaseBusinessIcon },
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
  id,
  onClick,
}: {
  href: string;
  label: string;
  icon: typeof HouseIcon;
  current: boolean;
  collapsed: boolean;
  id?: string;
  onClick?: () => void;
}) {
  return (
    <Hint label={label} show={collapsed}>
      <Link
        id={id}
        onClick={onClick}
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

// The rail's right edge: drag it, or focus it and use the arrow keys, to change the width.
function RailHandle({ rail, onChange }: { rail: RailState; onChange: (next: RailState) => void }) {
  const start = useRef<RailState | null>(null);
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={RAIL_COLLAPSED}
      aria-valuemax={RAIL_MAX}
      aria-valuenow={rail.collapsed ? RAIL_COLLAPSED : rail.width}
      className="group absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none outline-none pointer-coarse:-right-3 pointer-coarse:w-6"
      // Stops the drag from selecting the page's text.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = rail;
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onChange(dragRail(e.clientX - e.currentTarget.parentElement!.getBoundingClientRect().left, start.current));
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onKeyDown={(e) => {
        const next = keyRail(rail, e.key);
        if (!next) return;
        e.preventDefault();
        onChange(next);
      }}
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-link/50 group-focus-visible:bg-link" />
    </div>
  );
}

// The module rail: every module of CoreEx, then the account. Labels show beside the icons unless the User collapsed the
// rail. `saved` is the width and state remembered in the `rail` cookie; leave it out where the rail cannot resize or
// collapse (the phone menu). In the Knowledge Base and Career the `panel` takes the rail's place: the module list slides
// away and the panel slides in under a Back button, so there is one sidebar and not two. A collapsed rail has no room for
// it, so `onShowPanel` adds the button that opens the panel in a Sheet instead.
export function Rail({
  email,
  isAdmin,
  saved,
  panel,
  onShowPanel,
}: {
  email: string;
  isAdmin: boolean;
  saved?: RailState;
  panel?: React.ReactNode;
  onShowPanel?: (button: HTMLElement) => void;
}) {
  const pathname = usePathname();
  const active = activeModule(pathname);
  const panelName = active === "career" ? "Career" : "Knowledge Base";
  // Search is a page of the Knowledge Base module, but it has its own entry, so only that entry shows as current.
  const onSearch = pathname === "/search";
  const [rail, setRail] = useState(saved);
  const collapsed = rail?.collapsed ?? false;
  const toggle = useCallback(() => setRail((r) => r && { ...r, collapsed: !r.collapsed }), []);
  const resizable = rail !== undefined;

  // The panel shows while the User is in its module, until they press Back; leaving the module forgets Back.
  const [backFrom, setBackFrom] = useState<Module | null>(null);
  if (backFrom && backFrom !== active) setBackFrom(null);
  // Search is a Knowledge Base page with an entry of its own, so it keeps the module list (and its Search entry) in view.
  const drilled = !!panel && !collapsed && backFrom !== active && !onSearch;
  // Set by a press in the rail, so focus follows the swap only then, not when a page link or Ctrl+K changes the module.
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    document.getElementById(drilled ? "rail-back" : `rail-${active}`)?.focus();
  }, [drilled, active, pathname]);

  useEffect(() => {
    if (rail) document.cookie = `rail=${formatRail(rail)}; path=/; max-age=31536000; samesite=lax`;
  }, [rail]);

  // Not Ctrl+B: that is bold in the Note editor.
  useEffect(() => {
    if (!resizable) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "\\" || event.code === "Backslash")) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resizable, toggle]);

  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  // The two views sit on top of each other and slide; the one out of sight is inert, so it cannot be tabbed to or read.
  // Reduced motion is handled by the global rule in globals.css.
  const pane = "absolute inset-0 flex flex-col transition-[transform,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)]";
  const away = "pointer-events-none opacity-0";

  return (
    <nav
      aria-label="Main"
      style={rail && !collapsed ? { width: rail.width } : undefined}
      // The panel needs the room it had as a column of its own.
      className={cn("relative flex h-full flex-col border-r border-border bg-background py-3", collapsed ? "w-16 items-center" : "w-56", drilled && "min-w-72")}
    >
      <div className={cn("mb-3 flex items-center gap-3", collapsed ? "flex-col gap-1" : "px-4")}>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary font-bold text-primary-foreground">
          C
        </span>
        {!collapsed && <span className="flex-1 font-semibold">CoreEx</span>}
        {resizable && (
          <Hint label={`${toggleLabel} (Ctrl+\\)`} show>
            <button type="button" onClick={toggle} aria-label={toggleLabel} aria-keyshortcuts="Control+\ Meta+\" className={railButton}>
              <ToggleIcon aria-hidden />
            </button>
          </Hint>
        )}
      </div>
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div inert={drilled} className={cn(pane, "gap-1", collapsed ? "items-center" : "px-3", drilled && cn(away, "-translate-x-full"))}>
      {MODULES.map((m) => (
        <RailLink
          key={m.id}
          {...m}
          id={`rail-${m.id}`}
          onClick={() => {
            pressed.current = true;
            setBackFrom(null);
          }}
          current={active === m.id && !onSearch}
          collapsed={collapsed}
        />
      ))}
      {/* Collapsed to icons there is no room for the panel beside them, so it opens in a Sheet. */}
      {onShowPanel && collapsed && panel && (
        <Hint label={`Show the ${panelName} panel`} show>
          <button
            type="button"
            onClick={(e) => onShowPanel(e.currentTarget)}
            aria-label={`Show the ${panelName} panel`}
            className={entry(true)}
          >
            <PanelLeftIcon aria-hidden />
          </button>
        </Hint>
      )}
      <hr className={cn("my-2 border-border-subtle", collapsed ? "w-8" : "w-full")} />
      {/* Two different things: Quick find jumps to an Item by title (the palette); Search reads all text, also by meaning.
          The phone menu has no Quick find: the header icon is the phone's. */}
      {resizable && (
        <Hint label="Quick find (Ctrl+K)" show={collapsed}>
          <button
            type="button"
            onClick={openPalette}
            // Expanded, the name is the visible text; the keys are only a hint for the eye (axe's label-in-name check).
            aria-label={collapsed ? "Quick find" : undefined}
            aria-keyshortcuts="Control+K Meta+K"
            className={entry(collapsed)}
          >
            <CommandIcon aria-hidden />
            {!collapsed && (
              <>
                Quick find
                <kbd aria-hidden className="ml-auto rounded border border-border px-1.5 font-mono text-xs font-normal text-muted-foreground">
                  Ctrl K
                </kbd>
              </>
            )}
          </button>
        </Hint>
      )}
      <RailLink href="/search" label="Search" icon={SearchIcon} current={onSearch} collapsed={collapsed} />
      <RailLink href="/docs" label="Docs" icon={BookOpenIcon} current={active === "docs"} collapsed={collapsed} />
      <RailLink href="/trash" label="Trash" icon={Trash2Icon} current={active === "trash"} collapsed={collapsed} />
      {/* Only a convenience: the API refuses non-admins on its own (ADR 0004). */}
      {isAdmin && <RailLink href="/admin" label="Admin" icon={ShieldIcon} current={active === "admin"} collapsed={collapsed} />}

      <div className={cn("mt-auto flex flex-col gap-1", collapsed ? "items-center" : "items-stretch")}>
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
            <DropdownMenuItem asChild>
              <Link href="/settings/tokens">Access tokens</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/docs/mcp">Connect an Agent</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/export">Export</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                // Text kept in the browser for recovery must not stay for the next person on this computer.
                // shortcut: the Disabled and Invite-only pages sign out without this, their entries last up to 7 days.
                clearAllUnsaved();
                void signOut();
              }}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
      {panel && !collapsed && (
        <div inert={!drilled} className={cn(pane, !drilled && cn(away, "translate-x-full"))}>
          <div className="px-3 pb-1">
            <button
              type="button"
              id="rail-back"
              onClick={() => {
                pressed.current = true;
                setBackFrom(active);
              }}
              aria-label="Back to the menu"
              className={entry(false)}
            >
              <ChevronLeftIcon aria-hidden />
              Back
            </button>
          </div>
          <aside aria-label={panelName} className="min-h-0 flex-1">
            {panel}
          </aside>
        </div>
      )}
      </div>
      {rail && <RailHandle rail={rail} onChange={setRail} />}
    </nav>
  );
}
