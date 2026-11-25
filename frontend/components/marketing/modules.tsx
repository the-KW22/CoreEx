"use client";

import { BriefcaseBusinessIcon, FilesIcon, LibraryIcon, MessagesSquareIcon, PlugZapIcon, WaypointsIcon } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

import type { TagColour } from "@/lib/tag-colour";

import { usePinned } from "./use-pinned";

const MODULES: { name: string; text: string; colour: TagColour; Icon: typeof LibraryIcon }[] = [
  { name: "Knowledge Base", text: "Notes in Markdown, kept in Folders and grouped with Tags.", colour: "blue", Icon: LibraryIcon },
  { name: "Assets", text: "Images and PDFs, kept beside the Notes that use them.", colour: "pink", Icon: FilesIcon },
  { name: "Graph", text: "See how your Items connect, and which Links are missing.", colour: "green", Icon: WaypointsIcon },
  { name: "Career", text: "Resumes, Applications, Fit checks and interview practice.", colour: "orange", Icon: BriefcaseBusinessIcon },
  { name: "Chat", text: "Ask your own knowledge, with sources for every answer.", colour: "teal", Icon: MessagesSquareIcon },
  { name: "Agents", text: "Connect Claude or any MCP client with an access token.", colour: "yellow", Icon: PlugZapIcon },
];

// The module cards slide sideways as the band scrolls past. Each icon has its own Tag colour; Mint stays the colour of
// buttons and links. Phones and reduced motion get a wrapping grid instead.
export function Modules() {
  const band = useRef<HTMLElement>(null);
  const row = useRef<HTMLUListElement>(null);
  const pinned = usePinned();
  const [overflow, setOverflow] = useState(0);
  const { scrollYProgress } = useScroll({ target: band, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0.15, 0.85], [0, -overflow]);

  useLayoutEffect(() => {
    const el = row.current!;
    const measure = () => setOverflow(Math.max(0, el.scrollWidth - el.parentElement!.clientWidth));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [pinned]);

  return (
    <section ref={band} id="modules" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-medium text-link">Modules</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">One place, built from modules.</h2>
      </div>
      <div className="mx-auto mt-12 max-w-6xl overflow-hidden px-4 sm:px-6">
        <motion.ul ref={row} style={pinned ? { x } : undefined} className="flex flex-wrap gap-4 min-[800px]:motion-safe:w-max min-[800px]:motion-safe:flex-nowrap">
          {MODULES.map(({ name, text, colour, Icon }) => (
            <li key={name} className="grid grow basis-64 content-start gap-3 rounded-[14px] border border-border bg-surface p-5 min-[800px]:motion-safe:w-72 min-[800px]:motion-safe:shrink-0 min-[800px]:motion-safe:grow-0 min-[800px]:motion-safe:basis-auto">
              <span data-colour={colour} className="grid size-10 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--tag)_var(--tag-tint),transparent)] text-(--tag)">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="font-semibold">{name}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
