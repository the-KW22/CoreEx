"use client";

import Link from "next/link";
import { type KeyboardEvent, useId, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lineDiff } from "@/lib/line-diff";
import { cn } from "@/lib/utils";
import { type Proposal, keyAction, pendingBatch } from "@/lib/proposals";

import { answerProposals } from "./actions";

const STATUS_WORDS: Record<string, string> = { PENDING: "Pending", APPLIED: "Applied", REJECTED: "Rejected", REPLACED: "Replaced" };
const PREFIX = { same: "  ", add: "+ ", del: "- " } as const;

// The User's own text for a pending Note proposal, when it differs from what the assistant proposed; undefined otherwise.
function savedEdit(p: Proposal, typed: string | undefined): string | undefined {
  return p.status === "PENDING" && p.after != null && typed !== undefined && typed !== p.after ? typed : undefined;
}

const plain = (v: unknown): string => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

// A detail as one short line of text; null when there is nothing to show.
function detailValue(v: unknown): string | null {
  const s = Array.isArray(v) ? v.map(plain).join(", ") : v == null ? "" : plain(v);
  return s.trim() ? s : null;
}

function Diff({ before, after, full = false }: { before: string; after: string; full?: boolean }) {
  return (
    <div className={cn("overflow-auto rounded-md border border-border", full ? "max-h-[60vh] text-sm" : "max-h-64 font-mono text-xs")}>
      {lineDiff(before, after).map((line, i) => (
        <div key={i} className={cn("px-2 whitespace-pre-wrap", line.kind === "add" && "bg-primary/10", line.kind === "del" && "bg-destructive/10")}>
          <span aria-hidden>{PREFIX[line.kind]}</span>
          {line.kind !== "same" && <span className="sr-only">{line.kind === "add" ? "added: " : "removed: "}</span>}
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}

function ProposalCard({
  chatId,
  p,
  typed,
  busy,
  onEdit,
  onAnswered,
}: {
  chatId: string;
  p: Proposal;
  typed: string | undefined;
  busy: boolean;
  onEdit: (text: string) => void;
  onAnswered: () => void;
}) {
  const textId = useId();
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editable = p.status === "PENDING" && p.after != null;
  const saved = savedEdit(p, typed);

  function answer(decision: "APPROVE" | "REJECT") {
    setError(null);
    startSave(async () => {
      const result = await answerProposals(chatId, [p.id], decision, decision === "APPROVE" && saved !== undefined ? { [p.id]: saved } : {});
      if ("error" in result) setError(result.error);
      else {
        setPreviewing(false);
        onAnswered();
      }
    });
  }

  return (
    <article
      tabIndex={0}
      data-status={p.status}
      className="grid gap-2 rounded-[14px] border border-border p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{p.label}</h3>
        <span className="rounded-md border border-border px-2 py-0.5 text-xs">{STATUS_WORDS[p.status] ?? p.status}</span>
      </div>
      {p.change && (
        <dl className="grid gap-1 text-sm">
          {p.change.subject && <dd className="font-medium">{p.change.subject}</dd>}
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Before:</dt>
            <dd>{p.change.before || "Nothing"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">After:</dt>
            <dd>{p.change.after || "Nothing"}</dd>
          </div>
        </dl>
      )}
      {!p.change && Object.entries(p.details).map(([name, v]) => {
        const value = detailValue(v);
        return value === null ? null : (
          <p key={name} className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{name}:</span> {value}
          </p>
        );
      })}
      {p.after != null && <Diff before={p.before ?? ""} after={saved ?? p.after} />}
      {editable && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewing(true)}>
              Preview
            </Button>
            <Button variant="outline" size="sm" aria-expanded={editing} aria-controls={textId} onClick={() => setEditing(!editing)}>
              Edit text
            </Button>
          </div>
          {editing && (
            <>
              <label htmlFor={textId} className="text-xs text-muted-foreground">
                Your text for {p.label}
              </label>
              <textarea
                id={textId}
                rows={8}
                value={typed ?? p.after ?? ""}
                onChange={(e) => onEdit(e.target.value)}
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </>
          )}
          {saved !== undefined && <p className="text-xs text-muted-foreground">Your edit will be saved.</p>}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {p.status === "PENDING" && (
        <div className="flex flex-wrap gap-2">
          <Button data-decision="APPROVE" disabled={busy || saving} onClick={() => answer("APPROVE")}>
            Approve
          </Button>
          <Button data-decision="REJECT" variant="outline" disabled={busy || saving} onClick={() => answer("REJECT")}>
            Reject
          </Button>
        </div>
      )}
      {p.status === "APPLIED" && p.link && (
        <Link href={p.link.type === "NOTE" ? `/notes/${p.link.id}` : `/assets/${p.link.id}`} className="justify-self-start text-sm underline underline-offset-4">
          Open {p.link.title}
        </Link>
      )}
      <Dialog open={previewing} onOpenChange={setPreviewing}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview: {p.label}</DialogTitle>
            <DialogDescription>The whole text with the change marked. Nothing is saved until you approve.</DialogDescription>
          </DialogHeader>
          <Diff full before={p.before ?? ""} after={saved ?? p.after ?? ""} />
          <DialogFooter>
            <Button disabled={busy || saving} onClick={() => answer("APPROVE")}>
              Approve
            </Button>
            <Button variant="outline" disabled={busy || saving} onClick={() => answer("REJECT")}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

// One button pair for every pending Proposal of a batch: the server applies the batch all or nothing.
function BatchBar({
  chatId,
  pending,
  typed,
  busy,
  onAnswered,
}: {
  chatId: string;
  pending: Proposal[];
  typed: Record<string, string>;
  busy: boolean;
  onAnswered: () => void;
}) {
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function answer(decision: "APPROVE" | "REJECT") {
    setError(null);
    const edits: Record<string, string> = {};
    for (const p of pending) {
      const s = savedEdit(p, typed[p.id]);
      if (s !== undefined) edits[p.id] = s;
    }
    startSave(async () => {
      const result = await answerProposals(chatId, pending.map((p) => p.id), decision, decision === "APPROVE" ? edits : {});
      if ("error" in result) setError(result.error);
      else onAnswered();
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{pending.length} changes proposed together</p>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || saving} onClick={() => answer("APPROVE")}>
            Approve all
          </Button>
          <Button size="sm" variant="outline" disabled={busy || saving} onClick={() => answer("REJECT")}>
            Reject all
          </Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

// The Proposals of one assistant message. Keys: A approves and R rejects the focused pending card, Up and Down move between cards.
export function ProposalCards({ chatId, proposals, busy, onAnswered }: { chatId: string; proposals: Proposal[]; busy: boolean; onAnswered: () => void }) {
  const hintId = useId();
  const listRef = useRef<HTMLElement>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const batchIds = [...new Set(proposals.map((p) => p.batchId))];
  const batches = batchIds.map((b) => pendingBatch(proposals, b)).filter((group) => group.length >= 2);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    // A Preview dialog is drawn outside the list but its keys still bubble here: they are not card keys.
    if (!listRef.current?.contains(target)) return;
    const tag = target.tagName.toLowerCase();
    // A button with a modifier is a browser or assistive shortcut, not a card decision.
    if (tag === "button" && (e.altKey || e.ctrlKey || e.metaKey)) return;
    const action = keyAction(e.key, tag);
    if (!action) return;
    const cards = Array.from(listRef.current?.querySelectorAll("article") ?? []);
    const index = cards.findIndex((c) => c === document.activeElement || c.contains(document.activeElement));
    if (action === "next" || action === "previous") {
      e.preventDefault();
      const next = action === "next" ? Math.min(index + 1, cards.length - 1) : Math.max(index - 1, 0);
      cards[next]?.focus();
      return;
    }
    const card = cards[index];
    if (!card || card.dataset.status !== "PENDING") return;
    // Clicking the card's own button runs the same code path as a mouse click, with its error and refresh handling.
    card.querySelector<HTMLButtonElement>(`[data-decision="${action === "approve" ? "APPROVE" : "REJECT"}"]`)?.click();
  }

  return (
    <section aria-label="Proposals" ref={listRef} onKeyDown={onKeyDown} aria-describedby={hintId} className="grid gap-3">
      {batches.map((pending) => (
        <BatchBar key={pending[0].batchId} chatId={chatId} pending={pending} typed={typed} busy={busy} onAnswered={onAnswered} />
      ))}
      {proposals.map((p) => (
        <ProposalCard
          key={p.id}
          chatId={chatId}
          p={p}
          typed={typed[p.id]}
          busy={busy}
          onEdit={(text) => setTyped((t) => ({ ...t, [p.id]: text }))}
          onAnswered={onAnswered}
        />
      ))}
      <p id={hintId} className="text-xs text-muted-foreground">
        Keys: A approve, R reject, Up and Down move
      </p>
    </section>
  );
}
