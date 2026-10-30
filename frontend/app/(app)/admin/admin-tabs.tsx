"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Route-backed tabs, so each has its own address and the back button works. The order follows docs/DESIGN.md.
const TABS = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin", label: "Invites" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const current = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors pointer-coarse:py-3",
              current ? "border-link text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
