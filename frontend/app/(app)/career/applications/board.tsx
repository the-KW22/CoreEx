"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CLOSE_REASONS, STAGES, stageLabel, type CloseReason, type Stage } from "@/lib/applications";
import { cn } from "@/lib/utils";

import { moveOnBoard } from "./actions";
import type { Group } from "./applications-list";

const UNDO_MS = 5000;

// The Board: one column per Stage. A card is dragged to another column (or moved with its "Move to" menu), the card
// shows there at once, and the write is sent when the Undo toast closes. The write names the Stage the card was seen
// in, so a move made elsewhere meanwhile wins and the card snaps back to where it now is.
// shortcut: a move still inside its Undo window is lost if the tab closes, flush it on pagehide when that bites.
export function Board({ groups }: { groups: Group[] }) {
  const rows = groups.flatMap((g) => g.items.map((row) => ({ ...row, stage: g.stage })));
  const server = Object.fromEntries(rows.map((r) => [r.id, r.stage])) as Record<string, Stage>;
  // Where the User put a card, until the server has it there (or refused).
  const [placed, setPlaced] = useState<Record<string, Stage>>({});
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [closing, setClosing] = useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = useState<CloseReason>("NOT_SELECTED");
  const [over, setOver] = useState<Stage | null>(null);

  const stageOf = (id: string) => placed[id] ?? server[id];
  const without = (all: Record<string, Stage>, id: string) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id));

  function place(id: string, title: string, to: Stage, closeReason?: CloseReason) {
    const from = stageOf(id);
    if (from === to) return;
    let cancelled = false;
    let sent = false;
    setPlaced((all) => ({ ...all, [id]: to }));
    const send = () => {
      if (cancelled || sent) return;
      sent = true;
      queue.current = queue.current.then(async () => {
        // Moves of one card are sent in the order made, so the Stage it was seen in is the one it was dragged from.
        // A failed call must not break the queue for the moves behind it.
        const answer = await moveOnBoard(id, from, to, closeReason).catch(() => "error" as const);
        // A later move of the same card keeps its own place; the page already shows this one.
        setPlaced((all) => (answer === "saved" && all[id] !== to ? all : without(all, id)));
        if (answer === "saved") return;
        toast.error(
          answer === "conflict"
            ? `${title} was moved somewhere else, so your move was not made. The board shows where it is now.`
            : `Could not move ${title}. Try again.`,
        );
      });
    };
    toast(`Moved ${title} to ${stageLabel(to)}`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true;
          setPlaced((all) => (from === server[id] ? without(all, id) : { ...all, [id]: from }));
        },
      },
      onDismiss: send,
      onAutoClose: send,
    });
  }

  function request(id: string, title: string, to: Stage) {
    if (stageOf(id) === to) return;
    if (to === "CLOSED") setClosing({ id, title });
    else place(id, title, to);
  }

  return (
    <div className="grid gap-4">
      {closing && (
        <div role="group" aria-label={`Close ${closing.title}`} className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Why did {closing.title} close?
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as CloseReason)}
              className="h-9 rounded-lg border border-border bg-surface px-3"
            >
              {CLOSE_REASONS.map((r) => (
                <option key={r.reason} value={r.reason}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              place(closing.id, closing.title, "CLOSED", reason);
              setClosing(null);
            }}
          >
            Close Application
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setClosing(null)}>
            Cancel
          </Button>
        </div>
      )}

      <div className="grid auto-cols-[minmax(14rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {STAGES.map(({ stage, label }) => {
          const cards = rows.filter((r) => stageOf(r.id) === stage);
          return (
            <section
              key={stage}
              aria-labelledby={`column-${stage}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((now) => (now === stage ? null : now))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const row = rows.find((r) => r.id === e.dataTransfer.getData("text/plain"));
                if (row) request(row.id, row.title, stage);
              }}
              className={cn(
                "grid content-start gap-2 rounded-[10px] border border-border p-2",
                over === stage && "bg-surface",
              )}
            >
              <h2 id={`column-${stage}`} className="px-1 text-sm font-medium text-muted-foreground">
                {label} <span className="font-normal">({cards.length})</span>
              </h2>
              <ul className="grid min-h-16 content-start gap-2">
                {cards.map((row) => (
                  <li
                    key={row.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", row.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="grid cursor-grab gap-2 rounded-[10px] border border-border bg-background px-3 py-2"
                  >
                    <Link href={`/career/applications/${row.id}`} draggable={false} className="grid min-w-0 gap-1">
                      <span className="truncate font-medium" title={row.title}>
                        {row.title}
                      </span>
                      <span className={cn("truncate text-sm text-muted-foreground", row.due && "font-medium text-foreground")}>
                        {row.due ? `Needs you: ${row.next}` : row.next}
                      </span>
                    </Link>
                    <select
                      aria-label={`Move ${row.title} to`}
                      value=""
                      onChange={(e) => request(row.id, row.title, e.target.value as Stage)}
                      className="h-8 rounded-lg border border-border bg-surface px-2 text-sm"
                    >
                      <option value="" disabled>
                        Move to…
                      </option>
                      {STAGES.filter((s) => s.stage !== stage).map((s) => (
                        <option key={s.stage} value={s.stage}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
