import { cn } from "@/lib/utils";

// A section heading of the docs. Its "#" link is the heading's own address, and the "On this page" list reads these
// headings by id, so every h2 and h3 in a docs page is one of these.
export function DocsHeading({ level, id, children }: { level: 2 | 3; id: string; children: React.ReactNode }) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <div className="flex items-baseline gap-2">
      <Tag
        id={id}
        className={cn("scroll-mt-8", level === 2 ? "text-2xl font-semibold tracking-tight" : "text-lg font-semibold")}
      >
        {children}
      </Tag>
      <a href={`#${id}`} aria-label="Link to this section" data-copy-skip className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        #
      </a>
    </div>
  );
}
