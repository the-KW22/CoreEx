"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRef } from "react";

import { Button } from "@/components/ui/button";

import { AppWindow } from "./window";

// Copy first, then the product window at rest: tilted back, flattening as the page scrolls. Only transform and
// opacity change. With reduced motion the window is already flat.
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const rotateX = useTransform(scrollYProgress, [0, 0.7], [24, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.7], [0.92, 1]);

  return (
    <section ref={ref} className="mx-auto max-w-6xl px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-24">
      <p className="text-sm font-medium text-link">Your personal knowledge base</p>
      <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
        Everything you know, connected.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
        Write Notes, keep Assets, and let Links turn them into a Graph. Ask your own knowledge a question, or let your AI agent use it too.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="#request-access">Request access</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="#story">See how it works</Link>
        </Button>
      </div>
      <div className="mt-14 [perspective:1400px]">
        <motion.div style={reduce ? undefined : { rotateX, scale, transformOrigin: "50% 100%" }}>
          <AppWindow active="kb" title="Spaced repetition" className="mx-auto max-w-4xl">
            <div className="grid gap-3 p-5 text-sm sm:p-8">
              <p className="text-lg font-semibold sm:text-2xl">Spaced repetition</p>
              <p className="font-reading text-muted-foreground">
                Reviewing a card just before you forget it makes the memory last. It builds on{" "}
                <span className="font-semibold text-link underline underline-offset-4">[[Active recall]]</span> and the forgetting curve.
              </p>
            </div>
          </AppWindow>
        </motion.div>
      </div>
    </section>
  );
}
