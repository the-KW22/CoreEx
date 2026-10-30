"use client";

import { MotionConfig } from "motion/react";

import { duration, ease } from "@/lib/motion";

const transition = { duration: duration.base, ease: ease.out };

// "user": Motion skips transform and layout animation when the OS asks for reduced motion.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={transition}>
      {children}
    </MotionConfig>
  );
}
