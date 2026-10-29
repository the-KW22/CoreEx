import type { CSSProperties } from "react";

// The one place for animation timing: Motion reads these numbers, CSS reads them as variables on <html>.
export const duration = { fast: 0.15, base: 0.2, slow: 0.32 };
export const ease = { out: [0.22, 1, 0.36, 1], inOut: [0.65, 0, 0.35, 1] } as const;

export const motionCssVars = {
  "--duration-fast": `${duration.fast}s`,
  "--duration-base": `${duration.base}s`,
  "--duration-slow": `${duration.slow}s`,
  "--ease-out": `cubic-bezier(${ease.out.join(", ")})`,
  "--ease-in-out": `cubic-bezier(${ease.inOut.join(", ")})`,
} as CSSProperties;
