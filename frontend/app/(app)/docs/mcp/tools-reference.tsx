"use client";

import { SearchIcon } from "lucide-react";
import { useState } from "react";

import { DocsHeading } from "@/components/docs/docs-heading";
import { filterTools, toolsByGroup } from "@/lib/mcp-tool-groups";
import type { McpTool } from "@/lib/mcp-tools";

// Every tool of the server, one table per group, with a box that narrows them by name. The filter changes which
// headings are on the page, so the "On this page" list is told about it (it watches the page's content).
export function ToolsReference({ tools }: { tools: McpTool[] }) {
  const [filter, setFilter] = useState("");
  const shown = filterTools(tools, filter);
  const groups = toolsByGroup(shown);

  return (
    <div className="grid gap-6">
      <label className="relative block">
        <span className="sr-only">Filter tools by name</span>
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, such as list_ or trash"
          className="h-10 w-full rounded-lg border border-border bg-surface pr-3 pl-9"
        />
      </label>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {filter.trim() === "" ? `${tools.length} tools` : `${shown.length} of ${tools.length} tools`}
      </p>

      {groups.length === 0 && (
        <p className="text-sm">
          Nothing matches “{filter.trim()}”.{" "}
          <button type="button" onClick={() => setFilter("")} className="text-link underline underline-offset-4">
            Show every tool
          </button>
        </p>
      )}

      {groups.map(({ group, tools: groupTools }) => {
        const id = `group-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
          <section key={group} aria-labelledby={id} className="grid gap-3">
            <DocsHeading level={3} id={id}>
              {group}
            </DocsHeading>
            <div className="rounded-[14px] border border-border bg-surface px-4">
              <table className="block w-full text-sm md:table">
                <caption className="sr-only">{group} tools</caption>
                <thead className="sr-only md:not-sr-only md:table-header-group">
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Tool
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Kind
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      What it does
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Use it when
                    </th>
                  </tr>
                </thead>
                <tbody className="block divide-y divide-border-subtle md:table-row-group">
                  {groupTools.map((tool) => (
                    <tr key={tool.name} className="block py-3 md:table-row">
                      <th scope="row" className="block pb-1 text-left font-mono font-medium md:table-cell md:w-56 md:pr-4 md:pb-0 md:align-top md:py-3">
                        {tool.name}
                      </th>
                      <td className="block pb-1 md:table-cell md:w-20 md:pr-4 md:align-top md:py-3">
                        <span
                          className={
                            tool.kind === "change"
                              ? "inline-block rounded-full border border-foreground/40 px-2 py-0.5 text-xs font-semibold text-foreground"
                              : "inline-block rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                          }
                        >
                          {tool.kind === "change" ? "Change" : "Read"}
                        </span>
                      </td>
                      <td className="block pb-1 md:table-cell md:pr-4 md:align-top md:py-3">{tool.summary}</td>
                      <td className="block text-muted-foreground md:table-cell md:align-top md:py-3">{tool.useWhen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
