"use client";

import { BriefcaseBusinessIcon, FileUserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { itemLink } from "../kb-panel";

// The Career entries of docs/DESIGN.md section 3.4. Today, Resumes & Letters, Knowledge and Offers are left out until
// their epics land, so the panel never links to a page that is not there.
const ENTRIES = [
  { href: "/career/applications", label: "Applications", icon: BriefcaseBusinessIcon },
  { href: "/career/library", label: "Resumes & Letters", icon: FileUserIcon },
];

export function CareerPanel() {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-72 max-w-full flex-col gap-4 overflow-y-auto border-r border-border bg-panel p-4">
      <h2 className="text-sm font-semibold">Career</h2>
      <nav aria-label="Career">
        <ul className="grid gap-0.5">
          {ENTRIES.map(({ href, label, icon: Icon }) => {
            const current = pathname === href || pathname.startsWith(`${href}/`);
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
