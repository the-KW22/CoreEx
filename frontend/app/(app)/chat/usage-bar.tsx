"use client";

import { formatMoney, untilReset, usagePercent } from "@/lib/chat-usage";
import { cn } from "@/lib/utils";

export type Usage = { spentUsd: number; budgetUsd: number; resetsAt: string; available: boolean };

// Today's AI budget for this User, above the Chat (docs/DESIGN.md section 6.12). The meaning is in the text, not the colour.
export function UsageBar({ usage }: { usage: Usage | null }) {
  if (!usage) return null;
  if (!usage.available) return <p className="mb-2 text-sm text-muted-foreground">Chat is switched off right now.</p>;

  const percent = usagePercent(usage.spentUsd, usage.budgetUsd);
  // The time left is read on each render, as the spec asks; there is no timer, so it moves only when the page re-renders.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <div className="mb-2 grid gap-1.5">
      <p className="text-sm font-medium">Today&apos;s AI budget</p>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Today's AI budget used"
          className="h-2 min-w-32 flex-1 overflow-hidden rounded-full border border-border bg-surface"
        >
          <div className={cn("h-full", percent >= 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {`${formatMoney(usage.spentUsd)} of ${formatMoney(usage.budgetUsd)} used · starts again ${untilReset(usage.resetsAt, now)}`}
        </p>
      </div>
    </div>
  );
}
