// Text typed in the Note editor is also kept in the browser until it is saved, so a closed tab, a crash or an
// unreachable API does not lose it. One entry per tab and Note, so a save in one tab never clears another tab's text.
// Every call is safe without storage (private windows, blocked site data): it does nothing and finds nothing.

export type Store = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
export type Unsaved = { title: string; body: string; version: number; storedAt: number };

const PREFIX = "coreex:unsaved:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const browserStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

const keyOf = (noteId: string, session: string) => `${PREFIX}${noteId}:${session}`;

// Runs a storage call that may throw, and gives `fallback` when it does.
function safely<T>(fallback: T, run: () => T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

export function storeUnsaved(noteId: string, session: string, entry: Unsaved, store: Store | null = browserStore()) {
  safely(undefined, () => store?.setItem(keyOf(noteId, session), JSON.stringify(entry)));
}

export function clearUnsaved(noteId: string, session: string, store: Store | null = browserStore()) {
  safely(undefined, () => store?.removeItem(keyOf(noteId, session)));
}

// Every entry of every Note, for sign-out.
export function clearAllUnsaved(store: Store | null = browserStore()) {
  safely(undefined, () => {
    if (!store) return;
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k) => k?.startsWith(PREFIX));
    for (const key of keys) store.removeItem(key!);
  });
}

function parse(raw: string | null): Unsaved | null {
  try {
    const entry = JSON.parse(raw ?? "null");
    const ok =
      typeof entry?.title === "string" &&
      typeof entry.body === "string" &&
      typeof entry.version === "number" &&
      typeof entry.storedAt === "number";
    return ok ? entry : null;
  } catch {
    return null;
  }
}

// The newest entry for the Note, taken out of the store along with the older ones (the text it holds supersedes
// them) and anything past seven days. The caller stores it again under its own tab once it has put it on screen.
export function takeNewestUnsaved(noteId: string, now: number, store: Store | null = browserStore()): Unsaved | null {
  return safely(null, () => {
    if (!store) return null;
    const prefix = `${PREFIX}${noteId}:`;
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k) => k?.startsWith(prefix));
    let newest: Unsaved | null = null;
    for (const key of keys) {
      const entry = parse(store.getItem(key!));
      if (entry && now - entry.storedAt <= MAX_AGE_MS && (!newest || entry.storedAt > newest.storedAt)) newest = entry;
      store.removeItem(key!);
    }
    return newest;
  });
}

// What to do with an entry found on opening the Note: nothing when it is the stored text, put it back when it was
// typed on the stored version, and start in conflict when the Note has moved on since.
export function recoveryAction(
  entry: Unsaved,
  stored: { title: string; body: string; version: number },
): "none" | "restore" | "conflict" {
  if (entry.title === stored.title && entry.body === stored.body) return "none";
  return entry.version === stored.version ? "restore" : "conflict";
}
