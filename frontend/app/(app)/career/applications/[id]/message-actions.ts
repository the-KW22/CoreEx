"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

type Result = components["schemas"]["ResultResponse"];
export type Outcome = { ok: true; result: Result } | { ok: false; message: string };

type Reply = { response: Response; data?: Result; error?: unknown };

// The API error text, or the fallback; ErrorBody carries the message at its top level (AI_OFF, AI_BUDGET_SPENT, AI_BAD_ANSWER too).
const reason = (error: unknown) => (error as { message?: string } | undefined)?.message;
const unreachable = { ok: false, message: "Cannot reach the CoreEx API." } as const;

// A write: the page is refreshed, since the Library and the other tabs show what changed. A 409 on a change means the Application moved on.
const settle = (result: Reply | null, fallback: string, conflict = fallback): Outcome => {
  if (!result) return unreachable;
  if (result.response.status === 409) return { ok: false, message: conflict };
  if (!result.response.ok) return { ok: false, message: reason(result.error) ?? fallback };
  done(true);
  return result.data ? { ok: true, result: result.data } : { ok: false, message: fallback };
};

export async function readReply(id: string, message: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/replies", { params: { path: { id } }, body: { message } })
    .catch(() => null);
  return settle(result, "The email could not be read. Try again.");
}

export async function applyChange(id: string, resultId: string, index: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/results/{resultId}/changes/{index}/apply", { params: { path: { id, resultId, index } } })
    .catch(() => null);
  return settle(result, "The change could not be applied. Try again.", "This Application changed since, so this change can't be applied. Check it and make the change by hand.");
}

export async function undoChange(id: string, resultId: string, index: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/results/{resultId}/changes/{index}/undo", { params: { path: { id, resultId, index } } })
    .catch(() => null);
  return settle(result, "The change could not be undone. Try again.", "This Application changed since, so this can't be undone. Check it and change it by hand.");
}
