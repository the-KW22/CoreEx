"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export type Outcome = { ok: true } | { ok: false; message: string };

type Suggestion = components["schemas"]["SuggestionResponse"];
type Reply = { response: Response; error?: unknown };

// The API error text, or nothing; the error type is not declared for every route.
const reason = (error: unknown) => (error as { message?: string } | undefined)?.message;
const unreachable = { ok: false, message: "Cannot reach the CoreEx API." } as const;

// A write: the page is refreshed, since the questions, Library and submission all show on it.
const settle = (result: Reply | null, fallback: string): Outcome => {
  if (!result) return unreachable;
  if (!result.response.ok) return { ok: false, message: reason(result.error) ?? fallback };
  done(true);
  return { ok: true };
};

export async function addQuestion(id: string, body: components["schemas"]["AddQuestionRequest"]): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/career/questions", { params: { path: { id } }, body }).catch(() => null);
  return settle(result, "The question could not be added. Try again.");
}

export async function saveQuestion(id: string, questionId: string, body: components["schemas"]["SaveQuestionRequest"]): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .PUT("/api/applications/{id}/career/questions/{questionId}", { params: { path: { id, questionId } }, body })
    .catch(() => null);
  return settle(result, "The answer could not be saved. Try again.");
}

export async function removeQuestion(id: string, questionId: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api.DELETE("/api/applications/{id}/career/questions/{questionId}", { params: { path: { id, questionId } } }).catch(() => null);
  return settle(result, "The question could not be removed. Try again.");
}

export async function draftAnswer(id: string, questionId: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/career/questions/{questionId}/draft", { params: { path: { id, questionId } } }).catch(() => null);
  return settle(result, "The draft could not be made. Try again.");
}

export async function tightenAnswer(id: string, questionId: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/career/questions/{questionId}/tighten", { params: { path: { id, questionId } } }).catch(() => null);
  return settle(result, "The answer could not be tightened. Try again.");
}

export async function acceptResult(id: string, resultId: string, version: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/results/{resultId}/accept", { params: { path: { id, resultId } }, body: { version } })
    .catch(() => null);
  return settle(result, "The result could not be accepted. Try again.");
}

export async function rejectResult(id: string, resultId: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/career/results/{resultId}/reject", { params: { path: { id, resultId } } }).catch(() => null);
  return settle(result, "The result could not be rejected. Try again.");
}

export async function keepAnswer(id: string, questionId: string, scope: components["schemas"]["KeepRequest"]["scope"]): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/questions/{questionId}/library", { params: { path: { id, questionId } }, body: { scope } })
    .catch(() => null);
  return settle(result, "The answer could not be kept. Try again.");
}

// Read only, so it does not refresh the page.
export async function getSuggestions(
  id: string,
  questionId: string,
): Promise<{ ok: true; items: Suggestion[] } | { ok: false; message: string }> {
  const api = await getApi();
  const result = await api
    .GET("/api/applications/{id}/career/questions/{questionId}/suggestions", { params: { path: { id, questionId } } })
    .catch(() => null);
  if (!result) return unreachable;
  if (!result.data) return { ok: false, message: reason(result.error) ?? "The saved answers could not be found. Try again." };
  return { ok: true, items: result.data.items };
}

export async function reuseAnswer(id: string, questionId: string, libraryId: string, version: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/career/questions/{questionId}/reuse", { params: { path: { id, questionId } }, body: { libraryId, version } })
    .catch(() => null);
  return settle(result, "The saved answer could not be used. Try again.");
}

export async function removeFromLibrary(id: string, libraryId: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api.DELETE("/api/applications/{id}/career/library/{libraryId}", { params: { path: { id, libraryId } } }).catch(() => null);
  return settle(result, "The saved answer could not be removed. Try again.");
}

export async function markApplied(id: string): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/career/mark-applied", { params: { path: { id } } }).catch(() => null);
  return settle(result, "This could not be marked as applied. Try again.");
}
