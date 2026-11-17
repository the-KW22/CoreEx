"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export type Outcome = { ok: true } | { ok: false; message: string };

type Reply = { response: Response; error?: unknown };
type SaveDebrief = components["schemas"]["SaveDebriefRequest"];

// The API error text, or the fallback; ErrorBody carries the message at its top level.
const reason = (error: unknown) => (error as { message?: string } | undefined)?.message;

// A write: the page is refreshed, since the Library and the Debriefs show on it.
const settle = (result: Reply | null, fallback: string): Outcome => {
  if (!result) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (!result.response.ok) return { ok: false, message: reason(result.error) ?? fallback };
  done(true);
  return { ok: true };
};

export async function runPrep(id: string, seq: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/interviews/{seq}/prep", { params: { path: { id, seq } } })
    .catch(() => null);
  return settle(result, "The interview prep could not be made. Try again.");
}

export async function runPractice(id: string, question: string, answer: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/practice", { params: { path: { id } }, body: { question, answer } })
    .catch(() => null);
  return settle(result, "The feedback could not be made. Try again.");
}

export async function saveDebrief(id: string, seq: number, body: SaveDebrief): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .PUT("/api/applications/{id}/career/interviews/{seq}/debrief", { params: { path: { id, seq } }, body })
    .catch(() => null);
  return settle(result, "The Debrief could not be saved. Try again.");
}

export async function runDebriefSummary(id: string, seq: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/interviews/{seq}/debrief/summary", { params: { path: { id, seq } } })
    .catch(() => null);
  return settle(result, "The summary could not be made. Try again.");
}
