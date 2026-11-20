"use client";

import { BookOpenIcon, BriefcaseBusinessIcon, CalendarCheckIcon, FileUserIcon, HandshakeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { itemLink } from "../kb-panel";

// The Career entries of docs/DESIGN.md section 3.4.
const ENTRIES = [
  { href: "/career", label: "Today", icon: CalendarCheckIcon },
  { href: "/career/applications", label: "Applications", icon: BriefcaseBusinessIcon },
  { href: "/career/library", label: "Resumes & Letters", icon: FileUserIcon },
  { href: "/career/knowledge", label: "Knowledge", icon: BookOpenIcon },
  { href: "/career/offers", label: "Offers", icon: HandshakeIcon },
];

export function CareerPanel() {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold">Career</h2>
      <nav aria-label="Career">
        <ul className="grid gap-0.5">
          {ENTRIES.map(({ href, label, icon: Icon }) => {
            // Today is /career itself, so only an exact match counts for it.
            const current = pathname === href || (href !== "/career" && pathname.startsWith(`${href}/`));
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(itemLink, current && "bg-surface font-medium text-foreground")}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
