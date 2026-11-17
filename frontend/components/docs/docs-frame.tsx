"use client";

import { CopyIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DOC_PAGES, groupDocPages, neighbours } from "@/lib/docs";
import { cn } from "@/lib/utils";

import { OnThisPage } from "./on-this-page";

// The sidebar: the pages in their groups. `onNavigate` lets the phone Sheet close when a page is chosen.
function DocsNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs pages" className="grid gap-5 text-sm">
      {groupDocPages(DOC_PAGES).map(({ group, pages }) => (
        <div key={group} className="grid gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{group}</p>
          <ul className="grid gap-0.5">
            {pages.map((page) => {
              const current = page.href === pathname;
              return (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2.5 py-1.5 transition-colors hover:bg-surface hover:text-foreground",
                      current ? "bg-surface font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// Copies the text of the open page. The copy buttons inside it are left out (data-copy-skip).
// shortcut: copies the rendered text, not the Markdown source, so no page keeps a second copy of its words; upgrade if Users ask for Markdown.
function CopyPageButton() {
  function copy() {
    const article = document.getElementById("docs-content");
    if (!article) return;
    const skipped = Array.from(article.querySelectorAll<HTMLElement>("[data-copy-skip]"));
    skipped.forEach((el) => (el.style.display = "none"));
    const text = article.innerText;
    skipped.forEach((el) => (el.style.display = ""));
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied this page"),
      () => toast.error("Could not copy the page. Try again."),
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} className="ml-auto">
      <CopyIcon aria-hidden />
      Copy page
    </Button>
  );
}

function PrevNext({ pathname }: { pathname: string }) {
  const { previous, next } = neighbours(pathname);
  if (!previous && !next) return null;
  const card = "grid gap-1 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-link";
  return (
    <nav aria-label="Previous and next pages" className="mt-10 grid gap-3 border-t border-border-subtle pt-6 sm:grid-cols-2">
      {previous ? (
        <Link href={previous.href} className={card}>
          <span className="text-xs text-muted-foreground">Previous</span>
          <span className="font-medium">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className={cn(card, "text-right sm:col-start-2")}>
          <span className="text-xs text-muted-foreground">Next</span>
          <span className="font-medium">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}

// The frame of every docs page (docs/DESIGN.md section 6.11): pages on the left, "On this page" on the right, and both
// in a Sheet or above the text on narrower screens. The page's own text is the children, inside #docs-content.
export function DocsFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="grid w-full gap-8 xl:grid-cols-[13rem_minmax(0,1fr)_13rem] xl:gap-10">
      <div className="hidden xl:block">
        <div className="sticky top-8">
          <DocsNav />
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setMenuOpen(true)} className="xl:hidden">
            <MenuIcon aria-hidden />
            Docs pages
          </Button>
          <CopyPageButton />
        </div>
        <OnThisPage className="mb-6 xl:hidden" />
        <article id="docs-content" className="grid min-w-0 max-w-3xl gap-6">
          {children}
        </article>
        <PrevNext pathname={pathname} />
      </div>

      <div className="hidden xl:block">
        <div className="sticky top-8">
          <OnThisPage />
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72">
          <SheetTitle className="sr-only">Docs pages</SheetTitle>
          <div className="p-4 pt-12">
            <DocsNav onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
