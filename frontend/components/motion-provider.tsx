"use client";

import { MotionConfig } from "motion/react";

// Same values as --duration-base and --ease-out in globals.css; keep them in step.
const transition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

// "user": Motion skips transform and layout animation when the OS asks for reduced motion.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={transition}>
      {children}
    </MotionConfig>
  );
}
