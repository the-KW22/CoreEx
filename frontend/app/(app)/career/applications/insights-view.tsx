import Link from "next/link";

import { Button } from "@/components/ui/button";
import { closeReasonLabel, stageLabel } from "@/lib/applications";
import type { Insights, Range } from "@/lib/insights";

const BASE = "/career/applications?view=insights";
const field = "h-9 rounded-lg border border-border bg-surface px-3 text-sm";

function Tile({ id, label, children, note }: { id: string; label: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-1 rounded-[10px] border border-border px-4 py-3">
      <h3 id={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </h3>
      <p className="text-3xl font-semibold tracking-tight">{children}</p>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </section>
  );
}

const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? "" : "s"}`;

// Insights (docs/DESIGN.md section 6.4b): what is working in the job search, for the Applications applied to in a range
// of days (`from` and `to` in the address; empty means all of it).
export function InsightsView({ insights, range, everApplied }: { insights: Insights; range: Range; everApplied: boolean }) {
  const filtered = !!(range.from || range.to);
  return (
    <section aria-label="Insights" className="grid gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value="insights" />
        <label className="grid gap-1 text-sm">
          From
          <input type="date" name="from" defaultValue={range.from ?? ""} className={field} />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <input type="date" name="to" defaultValue={range.to ?? ""} className={field} />
        </label>
        <Button type="submit" size="sm">
          Show
        </Button>
        {filtered && (
          <Link href={BASE} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface">
            Clear dates
          </Link>
        )}
      </form>

      {insights.applied === 0 ? (
        <p className="text-muted-foreground">
          {everApplied
            ? "No Applications were applied to in these dates."
            : "Nothing applied to yet. Move an Application to Applied and its figures show here."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile id="tile-applied" label="Applied to">
              {insights.applied}
            </Tile>
            <Tile
              id="tile-reply-rate"
              label="Reply rate"
              note={`${insights.replied} of ${insights.applied} had a reply`}
            >
              {insights.replyRate}%
            </Tile>
            <Tile
              id="tile-median"
              label="Median time to first reply"
              note={insights.medianReplyDays === null ? "Nobody has replied yet." : "From applying to the first reply"}
            >
              {insights.medianReplyDays === null ? "None" : days(insights.medianReplyDays)}
            </Tile>
          </div>

          <section aria-labelledby="funnel-heading" className="grid gap-2">
            <h3 id="funnel-heading" className="text-sm font-medium">
              How far they got
            </h3>
            <ul className="grid gap-2">
              {insights.funnel.map(({ stage, count }) => (
                <li key={stage} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 text-sm">
                  <span>{stageLabel(stage)}</span>
                  <span aria-hidden className="h-3 rounded-full bg-surface">
                    <span
                      className="block h-3 rounded-full bg-foreground"
                      style={{ width: `${Math.round((count / insights.applied) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right font-medium">{count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="reasons-heading" className="grid gap-2">
            <h3 id="reasons-heading" className="text-sm font-medium">
              Why they closed
            </h3>
            {insights.closeReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">None have closed.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {insights.closeReasons.map(({ reason, count }) => (
                  <li key={reason} className="flex justify-between gap-3 border-b border-border-subtle py-1">
                    <span>{closeReasonLabel(reason)}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
