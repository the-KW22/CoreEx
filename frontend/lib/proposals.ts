import type { components } from "@/lib/api/schema";

export type Proposal = components["schemas"]["ProposalView"];
type ChatMessage = components["schemas"]["MessageView"];

// The Proposals of each assistant message, in the order the server sent them.
export function groupByMessage(proposals: Proposal[]): Map<string, Proposal[]> {
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const group = groups.get(p.messageId);
    if (group) group.push(p);
    else groups.set(p.messageId, [p]);
  }
  return groups;
}

// The Proposals of one batch that still wait for an answer.
export function pendingBatch(proposals: Proposal[], batchId: string): Proposal[] {
  return proposals.filter((p) => p.batchId === batchId && p.status === "PENDING");
}

// The generated types name blocks loosely, so only the fields a question needs are read.
type LooseBlock = { type?: string; name?: string; id?: string; input?: { question?: unknown; choices?: unknown } };

// The question the assistant is waiting on: only when the last message is the assistant's ask_user_question call.
export function pendingQuestion(messages: ChatMessage[]): { toolUseId: string; question: string; choices: string[] } | null {
  const last = messages.at(-1);
  if (last?.role !== "ASSISTANT") return null;
  const block = (last.blocks as LooseBlock[]).find((b) => b.type === "tool_use" && b.name === "ask_user_question");
  const question = block?.input?.question;
  if (!block?.id || typeof question !== "string" || !question.trim()) return null;
  const raw = block.input?.choices;
  if (!Array.isArray(raw)) return null;
  // shortcut: choices past five are dropped, not shown as a list, upgrade if the model ever needs more.
  const choices = raw
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 5);
  return { toolUseId: block.id, question: question.trim(), choices };
}

export type KeyAction = "approve" | "reject" | "next" | "previous";

// What a key does on a Proposal card; typing in a field is never a decision.
export function keyAction(key: string, tag: string): KeyAction | null {
  if (tag === "input" || tag === "textarea") return null;
  switch (key) {
    case "a":
    case "A":
      return "approve";
    case "r":
    case "R":
      return "reject";
    case "ArrowDown":
      return "next";
    case "ArrowUp":
      return "previous";
    default:
      return null;
  }
}
