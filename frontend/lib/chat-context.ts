// What Chat is told about where the User is (docs/DESIGN.md section 6.12): the Item that is open, the text selected in
// it, and a short trail of the User's last actions. Titles and ids only, never Note text apart from the User's own
// selection. It lives in the browser tab (the trail in sessionStorage, so it is gone when the tab closes) and is sent with
// each message; the server stores none of it.

export type TrailAction = "OPENED" | "CREATED" | "EDITED" | "MOVED" | "TRASHED" | "SEARCHED";
export type TrailKind = "NOTE" | "ASSET" | "FOLDER" | "TAG" | "SEARCH";
export type TrailEntry = { action: TrailAction; kind?: TrailKind; id?: string; title: string };
export type OpenItem = { kind: "NOTE" | "ASSET"; id: string; title: string };
export type ChatContext = { open?: OpenItem; selection?: string; trail?: TrailEntry[] };

// The limits the API enforces; longer values are cut here so a message is never refused for them.
export const MAX_TRAIL = 20;
export const MAX_TITLE = 300;
export const MAX_SELECTION = 2000;

const KEY = "coreex.trail";
let memory: TrailEntry[] = [];
let open: OpenItem | null = null;
let selection = "";

function load(): TrailEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TrailEntry[]) : memory;
  } catch {
    return memory;
  }
}

function save(entries: TrailEntry[]) {
  memory = entries;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage can be blocked; the trail then lives in memory until the page reloads.
  }
}

// Adds an action to the trail. The same action on the same Item straight after itself (every autosave of one Note, or a
// repeated search) is one entry, moved to the end with its newest title.
export function recordAction(entry: TrailEntry) {
  const next = { ...entry, title: entry.title.slice(0, MAX_TITLE) };
  const entries = load();
  const last = entries.at(-1);
  const same = last && last.action === next.action && last.kind === next.kind && last.id === next.id && (next.id !== undefined || last.title === next.title);
  save([...(same ? entries.slice(0, -1) : entries), next].slice(-MAX_TRAIL));
}

export function trailEntries(): TrailEntry[] {
  return load();
}

export function clearTrail() {
  save([]);
}

export function setOpenItem(item: OpenItem | null) {
  open = item && { ...item, title: item.title.slice(0, MAX_TITLE) };
  if (!item) selection = "";
}

export function setSelection(text: string) {
  selection = text.slice(0, MAX_SELECTION);
}

// The context to send with a message, or undefined when there is nothing to say.
export function chatContext(): ChatContext | undefined {
  const trail = load();
  const context: ChatContext = {};
  if (open) context.open = open;
  if (open && selection.trim()) context.selection = selection;
  if (trail.length > 0) context.trail = trail;
  return Object.keys(context).length > 0 ? context : undefined;
}

// A message prepared by another screen ("Ask Chat about this Note"). Held in memory only: never in a URL or history.
let prepared: string | null = null;
export const ASK_EVENT = "coreex:ask-chat";

export function askChat(text: string) {
  prepared = text;
  window.dispatchEvent(new Event(ASK_EVENT));
}

// Takes the prepared message once; the User still sends it.
export function takePrepared(): string | null {
  const text = prepared;
  prepared = null;
  return text;
}
