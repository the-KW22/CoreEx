"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { itemHref } from "@/lib/items";

import { type QuickHit, quickSearch } from "./actions";

// Ctrl+K (Cmd+K on a Mac) opens this on any page: type part of a title to jump to an Item, or pick one of the
// recently opened Items shown before you type. It is a native <dialog>, so focus stays inside it and Esc closes it.
export function QuickSwitcher() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<QuickHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        // Capture phase, so the editor and the browser do not get the key first.
        event.preventDefault();
        setQuery("");
        setHits([]);
        setSearched(false);
        setActive(0);
        setOpen(true);
        dialog.current?.showModal();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  // Look up as the text changes (and when the dialog opens, for the recents), ignoring answers that arrive late.
  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = setTimeout(
      async () => {
        const found = await quickSearch(query);
        if (!current) return;
        setHits(found);
        setSearched(true);
        setActive(0);
      },
      query ? 150 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  function go(hit: QuickHit) {
    dialog.current?.close();
    router.push(itemHref(hit));
  }

  function onInputKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      go(hits[active]);
    }
  }

  return (
    <dialog ref={dialog} className="quick-switcher" aria-label="Quick switcher" onClose={() => setOpen(false)}>
      <input
        type="text"
        role="combobox"
        aria-label="Jump to an Item by title"
        aria-expanded={hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Jump to…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onInputKey}
        autoFocus
      />
      <p className="quick-status" aria-live="polite">
        {!searched
          ? ""
          : hits.length === 0
            ? query
              ? "Nothing matches."
              : "Nothing to show yet."
            : query
              ? `${hits.length} ${hits.length === 1 ? "match" : "matches"}`
              : "Recent Items"}
      </p>
      <ul id={listId} role="listbox" aria-label="Matches">
        {hits.map((hit, index) => (
          <li
            key={hit.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={index === active ? "active" : undefined}
            onMouseEnter={() => setActive(index)}
            onClick={() => go(hit)}
          >
            <span>{hit.title || "Untitled"}</span>
            <small>
              {hit.type === "NOTE" ? "Note" : "Asset"}
              {hit.folderPath ? ` · ${hit.folderPath}` : ""}
            </small>
          </li>
        ))}
      </ul>
      <p className="quick-hint">↑ ↓ to move, Enter to open, Esc to close</p>
    </dialog>
  );
}
