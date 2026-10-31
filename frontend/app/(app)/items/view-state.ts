"use client";

import { useSyncExternalStore } from "react";

import type { ItemsView } from "@/lib/prefs";

// The Grid | List choice, shared by the toggle in the page header and the Items below it. The server sends the saved
// choice for the first paint; after that this is the one place that changes it and the `view` cookie.
let chosen: ItemsView | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useView = (saved: ItemsView) => useSyncExternalStore(subscribe, () => chosen ?? saved, () => saved);

export function chooseView(view: ItemsView) {
  chosen = view;
  document.cookie = `view=${view}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((listener) => listener());
}
