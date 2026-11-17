"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export type KnowledgeResult = { ok: true } | { ok: false; message: string };

type Category = components["schemas"]["FactRequest"]["category"];
type Candidate = components["schemas"]["CandidateResponse"];
type Preferences = components["schemas"]["PreferencesRequest"];

// The API error text, or nothing; the error type is not declared for every route.
const reason = (error: unknown) => (error as { message?: string } | undefined)?.message;

const failed = (message?: string): KnowledgeResult => ({ ok: false, message: message ?? "Something went wrong. Try again." });

// The one message for a missing API, shared by every action here.
const unreachable = failed("Cannot reach the CoreEx API.");

export async function createFact(text: string, category: Category): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api.POST("/api/knowledge/facts", { body: { text: text.trim(), category } }).catch(() => null);
  if (!result) return unreachable;
  return done(!!result.data) ? { ok: true } : failed(reason(result.error));
}

// A Fact pulled from a Resume or Note: the quote is the exact line the User picked; the server checks it is still there.
export async function pullFact(
  text: string,
  category: Category,
  sourceKind: "RESUME" | "NOTE",
  sourceId: string,
  quote: string,
): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api
    .POST("/api/knowledge/facts", { body: { text: text.trim(), category, sourceKind, sourceId, quote } })
    .catch(() => null);
  if (!result) return unreachable;
  return done(!!result.data) ? { ok: true } : failed(reason(result.error));
}

export async function candidatesOf(
  sourceKind: "RESUME" | "NOTE",
  sourceId: string,
): Promise<{ candidates: Candidate[] } | { message: string }> {
  const api = await getApi();
  const result = await api
    .GET("/api/knowledge/facts/candidates", { params: { query: { sourceKind, sourceId } } })
    .catch(() => null);
  if (!result) return { message: "Cannot reach the CoreEx API." };
  return result.data ? { candidates: result.data } : { message: reason(result.error) ?? "Could not read that source." };
}

export async function correctFact(id: string, text: string, category: Category): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api
    .PUT("/api/knowledge/facts/{id}", { params: { path: { id } }, body: { text: text.trim(), category } })
    .catch(() => null);
  if (!result) return unreachable;
  return done(!!result.data) ? { ok: true } : failed(reason(result.error));
}

export async function setFactStatus(id: string, status: "ACTIVE" | "OFF"): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api
    .PUT("/api/knowledge/facts/{id}/status", { params: { path: { id } }, body: { status } })
    .catch(() => null);
  if (!result) return unreachable;
  return done(!!result.data) ? { ok: true } : failed(reason(result.error));
}

// Forget for good: the text and its earlier wordings are removed; a pulled Fact's source cannot bring it back.
export async function forgetFact(id: string): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api.DELETE("/api/knowledge/facts/{id}", { params: { path: { id } } }).catch(() => null);
  if (!result) return unreachable;
  return done(result.response.ok) ? { ok: true } : failed(reason(result.error));
}

export async function createStory(title: string): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api.POST("/api/knowledge/stories", { body: { title: title.trim() || undefined } }).catch(() => null);
  if (!result) return unreachable;
  return done(!!result.data) ? { ok: true } : failed(reason(result.error));
}

export async function clearStory(noteId: string): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api
    .PUT("/api/knowledge/notes/{id}/story", { params: { path: { id: noteId } }, body: { story: false } })
    .catch(() => null);
  if (!result) return unreachable;
  return done(result.response.ok) ? { ok: true } : failed(reason(result.error));
}

export async function savePreferences(prefs: Preferences): Promise<KnowledgeResult> {
  const api = await getApi();
  const result = await api.PUT("/api/knowledge/preferences", { body: prefs }).catch(() => null);
  if (!result) return unreachable;
  return done(!!result.data) ? { ok: true } : failed(reason(result.error));
}
