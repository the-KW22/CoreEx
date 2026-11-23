"use client";

import Link from "next/link";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";

// The line above the Note while a Proposal is drawn on its text: what it is, and the User's answer. It answers the same
// Proposal as the card in the Chat (docs/DESIGN.md section 6.14).
export function ProposalBar({
  label,
  chatId,
  busy,
  error,
  onAnswer,
}: {
  label: string;
  chatId: string;
  busy: boolean;
  error: string | null;
  onAnswer: (decision: "APPROVE" | "REJECT") => void;
}) {
  return (
    <section aria-label="Proposed change" className="grid gap-2 rounded-[10px] border border-border bg-surface p-3 text-sm">
      <p>
        <span className="font-medium">Chat proposes:</span> {label}. Removed text is struck out and added text is marked, below.{" "}
        <Link href={`/chat/${chatId}`} className="underline underline-offset-2">
          Open the Chat
        </Link>
      </p>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => onAnswer("APPROVE")}>
          Accept
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onAnswer("REJECT")}>
          Reject
        </Button>
      </div>
    </section>
  );
}
