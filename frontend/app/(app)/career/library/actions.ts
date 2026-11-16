"use server";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export type ResumeResult = { ok: true } | { ok: false; message: string };

const failed = (message?: string): ResumeResult => ({ ok: false, message: message ?? "Something went wrong. Try again." });

// A new Resume, blank or with sample content. The editor comes with its own ticket, so the library shows it for now.
export async function createResume(title: string, sample: boolean): Promise<ResumeResult> {
  const api = await getApi();
  const result = await api.POST("/api/resumes", { body: { title: title.trim() || undefined, sample } }).catch(() => null);
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
