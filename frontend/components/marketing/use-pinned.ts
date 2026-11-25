import { useSyncExternalStore } from "react";

// True from 800px up when motion is welcome: where the page pins and moves sideways. Below that, and with reduced
// motion, everything sits still in its final state. The server renders the still version.
const PINNED = "(min-width: 800px) and (prefers-reduced-motion: no-preference)";
const subscribe = (on: () => void) => {
  const query = window.matchMedia(PINNED);
  query.addEventListener("change", on);
  return () => query.removeEventListener("change", on);
};
export const usePinned = () => useSyncExternalStore(subscribe, () => window.matchMedia(PINNED).matches, () => false);
