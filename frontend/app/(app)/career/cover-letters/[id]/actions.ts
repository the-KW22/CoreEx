"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";

type Document = components["schemas"]["CoverLetterDocument"];
type Letter = components["schemas"]["Letter"];
export type Outcome = { status: "saved"; letter: Letter } | { status: "conflict" | "error" };

export async function loadLetter(id: string): Promise<Letter | null> {
  const api = await getApi();
  const result = await api.GET("/api/cover-letters/{id}", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

export async function saveLetter(id: string, title: string, document: Document, version: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api.PUT("/api/cover-letters/{id}", { params: { path: { id } }, body: { title, document, version } }).catch(() => null);
  if (result?.data) return { status: "saved", letter: result.data };
  return { status: result?.response.status === 409 ? "conflict" : "error" };
}

export async function unlinkLetter(id: string, version: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/cover-letters/{id}/unlink", { params: { path: { id } }, body: { version } }).catch(() => null);
  if (result?.data) return { status: "saved", letter: result.data };
  return { status: result?.response.status === 409 ? "conflict" : "error" };
}

export async function saveLetterCopy(title: string, document: Document) {
  const api = await getApi();
  const copyTitle = `${title.trim().slice(0, 193) || "Cover Letter"} (mine)`;
  const result = await api.POST("/api/cover-letters", { body: { title: copyTitle, document } }).catch(() => null);
  return !!result?.data;
}

export async function letterMarkdown(id: string) {
  const api = await getApi();
  const result = await api.GET("/api/cover-letters/{id}/markdown", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

export async function draftChoices() {
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
  return { resumes, applications };
}

export async function makeLetterDraft(id: string, request: components["schemas"]["DraftCoverLetter"]) {
  const api = await getApi();
  const result = await api.POST("/api/cover-letters/{id}/drafts", { params: { path: { id } }, body: request }).catch(() => null);
  if (result?.data) return { status: "ok" as const, draft: result.data };
  return { status: result?.response.status === 429 ? "budget" as const : result?.response.status === 409 ? "conflict" as const : "error" as const };
}

export async function acceptLetterDraft(id: string, draftId: string, version: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/cover-letters/{id}/drafts/{draftId}/accept", { params: { path: { id, draftId } }, body: { version } }).catch(() => null);
  if (result?.data) return { status: "saved", letter: result.data };
  return { status: result?.response.status === 409 ? "conflict" : "error" };
}

export async function letterDrafts(id: string) {
  const api = await getApi();
  const result = await api.GET("/api/cover-letters/{id}/drafts", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

export async function letterVersions(id: string) {
  const api = await getApi();
  const result = await api.GET("/api/cover-letters/{id}/versions", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

export async function letterVersion(id: string, versionId: string) {
  const api = await getApi();
  const result = await api.GET("/api/cover-letters/{id}/versions/{versionId}", { params: { path: { id, versionId } } }).catch(() => null);
  return result?.data ?? null;
}

export async function nameLetterVersion(id: string, name: string) {
  const api = await getApi();
  const result = await api.POST("/api/cover-letters/{id}/versions", { params: { path: { id } }, body: { name } }).catch(() => null);
  return !!result?.data;
}

export async function restoreLetterVersion(id: string, versionId: string, version: number): Promise<Outcome> {
  const api = await getApi();
  const result = await api.POST("/api/cover-letters/{id}/versions/{versionId}/restore", { params: { path: { id, versionId } }, body: { version } }).catch(() => null);
  if (result?.data) return { status: "saved", letter: result.data };
  return { status: result?.response.status === 409 ? "conflict" : "error" };
}
