"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export type Outcome = { ok: true } | { ok: false; message: string };

type Reply = { response: Response; error?: unknown };
type EmailKind = components["schemas"]["EmailRequest"]["kind"];

// The API error text, or the fallback; ErrorBody carries the message at its top level (AI_OFF, AI_BUDGET_SPENT, AI_BAD_ANSWER too).
const reason = (error: unknown) => (error as { message?: string } | undefined)?.message;

// A write: the page is refreshed, since the Library shows the new email on it.
const settle = (result: Reply | null, fallback: string): Outcome => {
  if (!result) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (!result.response.ok) return { ok: false, message: reason(result.error) ?? fallback };
  done(true);
  return { ok: true };
};

export async function draftEmail(id: string, kind: EmailKind, interviewSeq?: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/emails", { params: { path: { id } }, body: { kind, interviewSeq } })
    .catch(() => null);
  return settle(result, "The email could not be made. Try again.");
}

export async function saveEmailEdit(id: string, resultId: string, subject: string, body: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .PUT("/api/applications/{id}/career/results/{resultId}/email", { params: { path: { id, resultId } }, body: { subject, body } })
    .catch(() => null);
  return settle(result, "The edit could not be saved. Try again.");
}
