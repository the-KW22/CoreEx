"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STORY_STEPS, storyAt } from "@/lib/story";

import { SCENES } from "./scenes";
import { usePinned } from "./use-pinned";
import { AppWindow } from "./window";

const STEP_TEXT = [
  "Write in Markdown. Type [[ to link to anything you have written, and the Link is made as you finish the name.",
  "Upload images and PDFs. They sit beside your Notes as Assets, with the same Folders and Tags.",
  "Every Link joins two Items, so what you know forms a Graph you can see and walk through.",
  "Ask a question in plain words. The answer comes from your own Notes and Assets, with its sources.",
];

// The same condition in CSS is the min-[800px]:motion-safe: prefix, written out in full because Tailwind reads whole class names.

export function Story() {
  const ref = useRef<HTMLElement>(null);
  const pinned = usePinned();
  const [progress, setProgress] = useState(0);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(p, "change", setProgress);

  // Intro: the copy fades, then the window flattens into the right column, then the step list slides in. The list is
  // fully transparent until the copy has gone, so the two never overlap.
  const copyOpacity = useTransform(p, [0.03, 0.13], [1, 0]);
  const copyY = useTransform(p, [0.03, 0.13], [0, -40]);
  const copyEvents = useTransform(copyOpacity, (o) => (o < 0.2 ? "none" : "auto"));
  const winX = useTransform(p, [0, 0.16], ["-39%", "0%"]);
  const winY = useTransform(p, [0, 0.16], ["60%", "0%"]);
  const winScale = useTransform(p, [0, 0.16], [1.2, 1]);
  const winTilt = useTransform(p, [0, 0.16], [22, 0]);
  const listOpacity = useTransform(p, [0.14, 0.2], [0, 1]);
  const listX = useTransform(p, [0.14, 0.2], [-24, 0]);

  const { step, local } = storyAt(progress);
  const shown = SCENES[Math.max(step, 0)];

  return (
    <section ref={ref} id="story" className={cn("relative", "min-[800px]:motion-safe:h-[600vh]")}>
      <div className={cn("mx-auto max-w-6xl px-4 sm:px-6", "min-[800px]:motion-safe:sticky", "min-[800px]:motion-safe:top-14", "min-[800px]:motion-safe:h-[calc(100dvh-3.5rem)]")}>
        <div className="relative h-full">
          <motion.div
            inert={pinned && progress > 0.13}
            style={pinned ? { opacity: copyOpacity, y: copyY, pointerEvents: copyEvents } : undefined}
            className={cn("pt-16 text-center sm:pt-24", "min-[800px]:motion-safe:absolute", "min-[800px]:motion-safe:inset-x-0", "min-[800px]:motion-safe:top-[4%]", "min-[800px]:motion-safe:pt-0")}
          >
            <p className="text-sm font-medium text-link">Your personal knowledge base</p>
            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-6xl">Everything you know, connected.</h1>
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
          </motion.div>

          <motion.div
            style={pinned ? { x: winX, y: winY, scale: winScale, rotateX: winTilt, transformPerspective: 1400 } : undefined}
            className={cn("hidden", "min-[800px]:motion-safe:block", "min-[800px]:motion-safe:absolute", "min-[800px]:motion-safe:top-1/2", "min-[800px]:motion-safe:right-0", "min-[800px]:motion-safe:w-[58%]", "min-[800px]:motion-safe:-translate-y-1/2")}
          >
            <AppWindow active={shown.rail} title={shown.title} decorative={shown.rail !== "graph"}>
              <div key={shown.title} className="absolute inset-0 animate-in fade-in duration-(--duration-base)">
                <shown.Scene p={step < 0 ? 0 : local} />
              </div>
            </AppWindow>
          </motion.div>

          <motion.ol
            aria-label="How CoreEx works"
            style={pinned ? { opacity: listOpacity, x: listX } : undefined}
            className={cn("mt-16 grid gap-12", "min-[800px]:motion-safe:absolute", "min-[800px]:motion-safe:top-1/2", "min-[800px]:motion-safe:left-0", "min-[800px]:motion-safe:mt-0", "min-[800px]:motion-safe:w-[36%]", "min-[800px]:motion-safe:-translate-y-1/2", "min-[800px]:motion-safe:gap-6")}
          >
            {STORY_STEPS.map((name, i) => {
              const Scene = SCENES[i].Scene;
              const active = pinned && step === i;
              return (
                <li key={name} aria-current={active ? "step" : undefined} className={cn("grid gap-3 border-l-2 pl-4", active ? "border-link" : "border-transparent")}>
                  <h2 className={cn("text-2xl font-semibold tracking-tight", active ? "text-foreground" : pinned ? "text-muted-foreground" : "")}>
                    <span className="mr-2 font-mono text-sm text-muted-foreground">0{i + 1}</span>
                    {name}
                  </h2>
                  <p className={cn("text-muted-foreground", active && "text-foreground")}>{STEP_TEXT[i]}</p>
                  {!pinned && (
                    <AppWindow active={SCENES[i].rail} title={SCENES[i].title} decorative={SCENES[i].rail !== "graph"} className={"min-[800px]:motion-safe:hidden"}>
                      <Scene p={1} />
                    </AppWindow>
                  )}
                </li>
              );
            })}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}
