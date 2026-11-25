"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

// Smooth scrolling for the marketing page only: it starts when the page mounts and is destroyed when the visitor leaves,
// so the app keeps native scrolling. Not with reduced motion. Lenis scrolls the real window, so Motion's useScroll and
// position: sticky keep working. Anchor links scroll smoothly too, below the 56px sticky nav.
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: { offset: -56 } });
    return () => lenis.destroy();
  }, []);
  return null;
}
