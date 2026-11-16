"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { TagBadge } from "@/components/tag-badge";
import { Button } from "@/components/ui/button";
import { CLOSE_REASONS, STAGES, type CloseReason, type Stage } from "@/lib/applications";
import type { TagColour } from "@/lib/tag-colour";
import { cn } from "@/lib/utils";

import {
  bulkAddTag,
  bulkMoveStage,
  bulkRemoveTag,
  bulkTrash,
  restoreApplications,
  type BulkOutcome,
} from "./actions";

export type RowTag = { id: string; name: string; colour?: TagColour | null };
export type Row = {
  id: string;
  title: string;
  next: string;
  due: boolean;
  updated: string | null;
  tags: RowTag[];
};
export type Group = { stage: Stage; label: string; items: Row[] };

const control = "h-9 rounded-lg border border-border bg-surface px-3 text-sm";

// The grouped Applications list with selection: a checkbox on each row (Shift-click for a range), one on each Stage
// heading for the whole group, and a bar of bulk actions while any are selected.
export function ApplicationsList({ groups, tags }: { groups: Group[]; tags: { id: string; name: string }[] }) {
  const rows = groups.flatMap((g) => g.items);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("APPLIED");
  const [reason, setReason] = useState<CloseReason>("NOT_SELECTED");
  const [tagName, setTagName] = useState("");
  const [tagId, setTagId] = useState("");
  const [pending, start] = useTransition();

  const titleOf = (id: string) => rows.find((r) => r.id === id)?.title ?? "an Application";

  function toggle(id: string, range: boolean) {
    const next = new Set(selected);
    const from = rows.findIndex((r) => r.id === anchor);
    const to = rows.findIndex((r) => r.id === id);
    if (range && from >= 0 && to >= 0) {
      for (const row of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(row.id);
    } else if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setAnchor(id);
  }

  function toggleGroup(group: Group) {
    const next = new Set(selected);
    const all = group.items.every((r) => next.has(r.id));
    for (const row of group.items) {
      if (all) next.delete(row.id);
      else next.add(row.id);
    }
    setSelected(next);
  }

  // Says what worked and what did not, and leaves the ones that failed selected so they can be tried again.
  function report(out: BulkOutcome, did: string) {
    if (!out) {
      toast.error("Could not reach the CoreEx API. Try again.");
      return false;
    }
    if (did && out.done.length) toast.success(`${did} ${out.done.length} Application${out.done.length === 1 ? "" : "s"}`);
    if (out.failed.length) toast.error(`Could not change: ${out.failed.map((f) => titleOf(f.id)).join(", ")}`);
    setSelected(new Set(out.failed.map((f) => f.id)));
    return out.done.length > 0;
  }

  const ids = [...selected];
  const run = (call: () => Promise<BulkOutcome>, did: string, after?: () => void) =>
    start(async () => {
      if (report(await call(), did)) after?.();
    });

  function trash() {
    start(async () => {
      const out = await bulkTrash(ids);
      if (!report(out, "")) return;
      const trashed = out?.done ?? [];
      toast.success(`Moved ${trashed.length} Application${trashed.length === 1 ? "" : "s"} to the Trash`, {
        action: {
          label: "Undo",
          onClick: () =>
            start(async () => {
              const back = await restoreApplications(trashed);
              if (back.failed.length) toast.error("Could not bring everything back. Try the Trash.");
            }),
        },
      });
    });
  }

  return (
    <div className="grid gap-6">
      {selected.size > 0 && (
        <section
          aria-label="Bulk actions"
          className="sticky top-0 z-10 grid gap-3 rounded-[10px] border border-border bg-surface p-3"
        >
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Move to
              <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={control}>
                {STAGES.map((s) => (
                  <option key={s.stage} value={s.stage}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {stage === "CLOSED" && (
              <label className="flex items-center gap-2 text-sm">
                Why did they close?
                <select value={reason} onChange={(e) => setReason(e.target.value as CloseReason)} className={control}>
                  {CLOSE_REASONS.map((r) => (
                    <option key={r.reason} value={r.reason}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => run(() => bulkMoveStage(ids, stage, stage === "CLOSED" ? reason : undefined), "Moved")}
            >
              Move
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Tag
              <input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                maxLength={50}
                placeholder="Tag name"
                className={control}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={pending || !tagName.trim()}
              onClick={() => run(() => bulkAddTag(ids, tagName.trim()), "Tagged", () => setTagName(""))}
            >
              Add Tag
            </Button>
            {tags.length > 0 && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  Remove
                  <select value={tagId} onChange={(e) => setTagId(e.target.value)} className={control}>
                    <option value="">Pick a Tag</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || !tagId}
                  onClick={() => run(() => bulkRemoveTag(ids, tagId), "Untagged")}
                >
                  Remove Tag
                </Button>
              </>
            )}
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={trash}>
              Move to Trash
            </Button>
          </div>
        </section>
      )}

      {groups.map((group) => {
        const all = group.items.every((r) => selected.has(r.id));
        return (
          <section key={group.stage} aria-labelledby={`stage-${group.stage}`} className="grid gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Select all in ${group.label}`}
                checked={all}
                onChange={() => toggleGroup(group)}
                className="m-1.5 size-4"
              />
              <h2 id={`stage-${group.stage}`} className="text-sm font-medium text-muted-foreground">
                {group.label}
              </h2>
            </div>
            <ul className="grid gap-2">
              {group.items.map((row) => (
                <li key={row.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.title}`}
                    checked={selected.has(row.id)}
                    onChange={() => {}}
                    onClick={(e) => toggle(row.id, e.shiftKey)}
                    className="m-1.5 size-4 shrink-0"
                  />
                  <Link
                    href={`/career/applications/${row.id}`}
                    className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-1 rounded-[10px] border border-border px-4 py-3 hover:bg-surface"
                  >
                    <span className="truncate font-medium" title={row.title}>
                      {row.title}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      <span className={cn(row.due && "font-medium text-foreground")}>
                        {row.due ? `Needs you: ${row.next}` : row.next}
                      </span>
                      {row.updated && ` · Updated ${row.updated}`}
                    </span>
                    {row.tags.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {row.tags.map((tag) => (
                          <TagBadge key={tag.id} name={tag.name} colour={tag.colour} />
                        ))}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
