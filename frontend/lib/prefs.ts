// What the Items pages remember about how the User likes to look at them, kept in cookies so the server renders the
// right thing on the first paint.

export type ItemsView = "list" | "grid";

// Like Google Drive, the Items open as a grid until the User chooses the list.
export const parseView = (value: string | undefined): ItemsView => (value === "list" ? "list" : "grid");

// The ids of the sections the User has collapsed, as a comma list.
export const parseCollapsed = (value: string | undefined) => new Set((value ?? "").split(",").filter(Boolean));

// The cookie value after one section is collapsed or opened.
export function withCollapsed(value: string | undefined, id: string, collapsed: boolean) {
  const ids = parseCollapsed(value);
  if (collapsed) ids.add(id);
  else ids.delete(id);
  return [...ids].join(",");
}

// The module rail's width in px, and whether it is collapsed to icons. A collapsed rail keeps its width to open at.
export type RailState = { collapsed: boolean; width: number };

export const RAIL_MIN = 192;
export const RAIL_MAX = 320;
export const RAIL_DEFAULT = 224;
export const RAIL_COLLAPSED = 64;
export const RAIL_STEP = 16;
// Dragged left of this, the rail snaps shut; between here and the minimum it waits at the minimum.
export const RAIL_SNAP = (RAIL_MIN + RAIL_COLLAPSED) / 2;

const clampRail = (width: number) => Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(width)));

// The `rail` cookie: "240" or "collapsed:240". Older versions saved only "expanded" or "collapsed".
export function parseRail(value: string | undefined): RailState {
  const width = Number(value?.split(":").pop());
  return {
    collapsed: value?.startsWith("collapsed") ?? false,
    width: value && Number.isFinite(width) ? clampRail(width) : RAIL_DEFAULT,
  };
}

export const formatRail = ({ collapsed, width }: RailState) => (collapsed ? `collapsed:${width}` : `${width}`);

// The rail during a drag: `x` is the pointer's distance from the rail's left edge, `start` the rail when the drag began.
// Snapping shut keeps the starting width, so opening again does not land on the minimum the drag passed through.
export function dragRail(x: number, start: RailState): RailState {
  if (x < RAIL_SNAP) return { collapsed: true, width: start.width };
  return { collapsed: false, width: clampRail(start.collapsed ? Math.max(start.width, x) : x) };
}

// The rail after a key press on its resize handle, or null for a key that does nothing there.
export function keyRail({ collapsed, width }: RailState, key: string): RailState | null {
  switch (key) {
    case "ArrowLeft":
      return collapsed ? { collapsed, width } : width <= RAIL_MIN ? { collapsed: true, width } : { collapsed, width: clampRail(width - RAIL_STEP) };
    case "ArrowRight":
      return { collapsed: false, width: collapsed ? width : clampRail(width + RAIL_STEP) };
    case "Home":
      return { collapsed: false, width: RAIL_MIN };
    case "End":
      return { collapsed: false, width: RAIL_MAX };
    case "Enter":
      return { collapsed: !collapsed, width };
    default:
      return null;
  }
}
