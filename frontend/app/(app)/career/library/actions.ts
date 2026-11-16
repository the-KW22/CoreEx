"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export type ResumeResult = { ok: true } | { ok: false; message: string };

const failed = (message?: string): ResumeResult => ({ ok: false, message: message ?? "Something went wrong. Try again." });

// A new Resume, blank, with sample content, or from an imported document (the backend checks and sanitises it like a save).
// shortcut: an imported document over about 1 MB is refused by Next's server-action body limit, upgrade by raising serverActions.bodySizeLimit in next.config when a real file needs it.
export async function createResume(
  title: string,
  sample: boolean,
  imported?: components["schemas"]["ResumeDocument"],
): Promise<ResumeResult> {
  const api = await getApi();
  const result = await api
    .POST("/api/resumes", { body: { title: title.trim() || undefined, sample, document: imported } })
    .catch(() => null);
  if (!result) return failed("Cannot reach the CoreEx API.");
  return done(!!result.data) ? { ok: true } : failed(result.error?.message);
}

export async function renameResume(id: string, title: string): Promise<ResumeResult> {
  const api = await getApi();
  const result = await api
    .PUT("/api/resumes/{id}/title", { params: { path: { id } }, body: { title } })
    .catch(() => null);
  if (!result) return failed("Cannot reach the CoreEx API.");
  return done(result.response.ok) ? { ok: true } : failed(result.error?.message);
}

export async function duplicateResume(id: string): Promise<ResumeResult> {
  const api = await getApi();
  const result = await api.POST("/api/resumes/{id}/duplicate", { params: { path: { id } } }).catch(() => null);
  if (!result) return failed("Cannot reach the CoreEx API.");
  return done(!!result.data) ? { ok: true } : failed(result.error?.message);
}
