"use client";

import { Button } from "@/components/ui/button";
import type { graphInsights } from "@/lib/graph";

/** What is lit in the canvas: which answer, and the Items in it. */
export type Highlight = { key: string; ids: string[] };

// The questions people open a graph to answer. Each answer is a button that lights it up in the canvas, so this is also
// a text alternative for the shape of the graph.
export function GraphInsights({
  insights,
  highlight,
  orphansHidden,
  onHighlight,
}: {
  insights: ReturnType<typeof graphInsights>;
  highlight: Highlight | null;
  orphansHidden: boolean;
  onHighlight: (highlight: Highlight | null) => void;
}) {
  const { orphans, hubs, groups } = insights;
  const answer = (key: string, ids: string[], text: React.ReactNode, disabled = false) => {
    const on = highlight?.key === key;
    return (
      <Button
        variant="ghost"
        disabled={disabled}
        aria-pressed={on}
        className={`h-auto w-full justify-between gap-2 px-2 py-1 text-left font-normal whitespace-normal ${on ? "bg-accent" : ""}`}
        onClick={() => onHighlight(on ? null : { key, ids })}
      >
        {text}
      </Button>
    );
  };
  return (
    <div className="grid content-start gap-5 text-sm">
      <section className="grid gap-1">
        <h2 className="font-medium">No Links</h2>
        {orphans.length === 0 ? (
          <p className="text-muted-foreground">Every Item here has a Link.</p>
        ) : (
          answer("orphans", orphans, `${orphans.length} ${orphans.length === 1 ? "Item" : "Items"} with no Links`, orphansHidden)
        )}
        {orphansHidden && orphans.length > 0 && <p className="text-xs text-muted-foreground">Hidden by Only linked Items.</p>}
      </section>
      <section className="grid gap-1">
        <h2 className="font-medium">Most linked</h2>
        {hubs.length === 0 ? (
          <p className="text-muted-foreground">No Links yet.</p>
        ) : (
          <ul className="grid gap-0.5">
            {hubs.map((hub) => (
              <li key={hub.id}>
                {answer(
                  `hub:${hub.id}`,
                  hub.ids,
                  <>
                    <span className="min-w-0 break-words">{hub.title}</span>
                    <span className="text-muted-foreground">{hub.links}</span>
                  </>,
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-1">
        <h2 className="font-medium">{groups.length === 1 ? "1 separate group" : `${groups.length} separate groups`}</h2>
        {groups.length === 0 ? (
          <p className="text-muted-foreground">No Items are joined yet.</p>
        ) : (
          <ul className="grid gap-0.5">
            {groups.map((group) => (
              <li key={group.name + group.ids[0]}>
                {answer(
                  `group:${group.ids[0]}`,
                  group.ids,
                  <>
                    <span className="min-w-0 break-words">{group.name}</span>
                    <span className="text-muted-foreground">{group.ids.length}</span>
                  </>,
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
