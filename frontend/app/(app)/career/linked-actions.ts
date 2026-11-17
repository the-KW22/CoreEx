"use server";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export async function linkedChoices() {
  const api = await getApi();
  const resumes: { id: string; title: string }[] = [];
  const applications: { id: string; title: string }[] = [];
  for (let page = 0; ; page++) {
    const result = await api.GET("/api/resumes", { params: { query: { page, size: 100 } } }).catch(() => null);
    if (!result?.data) return null;
    resumes.push(...result.data.items);
    if (resumes.length >= result.data.total || !result.data.items.length) break;
  }
  for (let page = 0; ; page++) {
    const result = await api.GET("/api/applications", { params: { query: { page, size: 100 } } }).catch(() => null);
    if (!result?.data) return null;
    applications.push(...result.data.items);
    if (applications.length >= result.data.total || !result.data.items.length) break;
  }
  const letters = await api.GET("/api/cover-letters").catch(() => null);
  return letters?.data ? { resumes, applications, letters: letters.data.map(({ id, title }) => ({ id, title })) } : null;
}

export async function setLinkedDocument(app: string, kind: "RESUME" | "COVER_LETTER", itemId: string | null, replaceExisting = false) {
  const api = await getApi();
  const result = await api.PUT("/api/applications/{id}/linked-documents", { params: { path: { id: app } }, body: { kind, itemId, replaceExisting } }).catch(() => null);
  if (!result?.data) return result?.response.status === 409 ? "sent" as const : "error" as const;
  done(true);
  return "ok" as const;
}

export async function copyResumeForJob(app: string, resumeId: string, requestId: string) {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/copy-resume", { params: { path: { id: app } }, body: { resumeId, requestId } }).catch(() => null);
  if (!result?.data) return false;
  done(true);
  return true;
}
