"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const HEADINGS = "#docs-content h2[id], #docs-content h3[id]";

// The headings of the open docs page, read from the page once it is on screen.
function readHeadings() {
  return Array.from(document.querySelectorAll<HTMLElement>(HEADINGS)).map((el) => ({
    id: el.id,
    text: el.textContent ?? "",
    level: el.tagName === "H2" ? (2 as const) : (3 as const),
  }));
}

// Lists the headings of the open docs page (inside #docs-content) and marks the one nearest the top of the screen.
// Rendered twice by the frame: beside the text on wide screens, above it on narrower ones.
export function OnThisPage({ className }: { className?: string }) {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<{ id: string; text: string; level: 2 | 3 }[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  // A new page has new headings: read them after the page has been drawn, and again whenever the page's content
  // changes (a filter can take a group's heading away).
  useEffect(() => {
    const article = document.getElementById("docs-content");
    const refresh = () => setHeadings(readHeadings());
    const frame = requestAnimationFrame(refresh);
    const watcher = article ? new MutationObserver(refresh) : null;
    if (article) watcher?.observe(article, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      watcher?.disconnect();
    };
  }, [pathname]);

  // A heading counts as read once it is in the top 30% of the screen; the last one to get there stays marked.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>(HEADINGS));
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = elements.find((el) => visible.has(el.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;
  return (
    <nav aria-label="On this page" className={className}>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">On this page</p>
      <ul className="grid gap-1.5 text-sm">
        {headings.map((h) => (
          <li key={h.id} className={cn(h.level === 3 && "pl-3")}>
            <a
              href={`#${h.id}`}
              aria-current={current === h.id ? "location" : undefined}
              className={cn(
                "block border-l-2 py-0.5 pl-2.5 transition-colors",
                current === h.id ? "border-link font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
