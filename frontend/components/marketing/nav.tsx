import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const links = [
  { href: "#story", label: "Product" },
  { href: "#agents", label: "Agents" },
  { href: "#career", label: "Career" },
  { href: "/docs", label: "Docs" },
];

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <nav aria-label="Site" className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2.5 font-semibold">
          <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-primary font-bold text-primary-foreground">C</span>
          CoreEx
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <ThemeToggle className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground [&_svg]:size-4" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="#request-access">Request access</Link>
        </Button>
      </nav>
    </header>
  );
}
