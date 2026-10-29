"use client";

import { motion } from "motion/react";

// Children marked StaggerItem fade and rise in one after another. With reduced motion asked for, MotionConfig in the
// root layout drops the movement and keeps a plain fade.
const list = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

export function Stagger({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={list}>
      {children}
    </motion.div>
  );
}

export function StaggerItem(props: React.ComponentProps<typeof motion.section>) {
  return <motion.section variants={item} {...props} />;
}
