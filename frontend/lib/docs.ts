// The pages of the in-app docs, in reading order. The sidebar, the previous and next links and the Copy page button
// all read this one list, so adding a page means adding it here (docs/DESIGN.md section 6.11).
export type DocPage = { href: string; title: string; group: string };

export const DOC_PAGES: DocPage[] = [
  { href: "/docs", title: "Introduction", group: "Getting started" },
  { href: "/docs/shortcuts", title: "Keyboard shortcuts", group: "Getting started" },
  { href: "/docs/mcp", title: "Overview", group: "MCP" },
  { href: "/docs/mcp/quick-start", title: "Quick start", group: "MCP" },
  { href: "/docs/mcp/connect", title: "Connect a client", group: "MCP" },
  { href: "/docs/mcp/tools", title: "Tools", group: "MCP" },
  { href: "/docs/mcp/security", title: "Security", group: "MCP" },
  { href: "/docs/mcp/limits", title: "Limits", group: "MCP" },
  { href: "/docs/mcp/troubleshooting", title: "Troubleshooting", group: "MCP" },
];

// The pages of each group, in the order the groups first appear.
export function groupDocPages(pages: DocPage[]): { group: string; pages: DocPage[] }[] {
  const groups: { group: string; pages: DocPage[] }[] = [];
  for (const page of pages) {
    const existing = groups.find((g) => g.group === page.group);
    if (existing) existing.pages.push(page);
    else groups.push({ group: page.group, pages: [page] });
  }
  return groups;
}

// The page before and after `pathname` in the list. Both are null for a page that is not in it.
export function neighbours(pathname: string): { previous: DocPage | null; next: DocPage | null } {
  const path = pathname.replace(/\/+$/, "");
  const at = DOC_PAGES.findIndex((p) => p.href === path);
  if (at === -1) return { previous: null, next: null };
  return { previous: DOC_PAGES[at - 1] ?? null, next: DOC_PAGES[at + 1] ?? null };
}
