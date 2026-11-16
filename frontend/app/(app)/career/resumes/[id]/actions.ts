"use server";

import { getApi } from "@/lib/api/server";

import { mineTitle, type ResumeDocument } from "./store";

export type SaveResult =
  | { status: "saved"; version: number }
  | { status: "conflict" }
  | { status: "error"; message: string };

export type Loaded = { title: string; doc: ResumeDocument; version: number };

// Saves the whole document with the save counter the editor last saw.
export async function saveResume(id: string, title: string, doc: ResumeDocument, version: number): Promise<SaveResult> {
  const api = await getApi();
  const result = await api
    .PUT("/api/resumes/{id}", { params: { path: { id } }, body: { title, document: doc, version } })
    .catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  if (result.response.status === 409) return { status: "conflict" };
  if (!result.data) return { status: "error", message: result.error?.message ?? "Could not save the Resume." };
  return { status: "saved", version: result.data.version };
}

// The stored Resume, for loading it after a conflict.
export async function loadResume(id: string): Promise<Loaded | null> {
  const api = await getApi();
  const result = await api.GET("/api/resumes/{id}", { params: { path: { id } } }).catch(() => null);
  return result?.data ? { title: result.data.title, doc: result.data.document, version: result.data.version } : null;
}

// Another tab saved first: keep what this tab typed as a new Resume called "<title> (mine)". False when it was not kept.
export async function saveCopy(title: string, doc: ResumeDocument): Promise<boolean> {
  const api = await getApi();
  const made = await api.POST("/api/resumes", { body: { title: mineTitle(title), id: crypto.randomUUID() } }).catch(() => null);
  if (!made?.data) return false;
  const saved = await api
    .PUT("/api/resumes/{id}", {
      params: { path: { id: made.data.id } },
      body: { title: made.data.title, document: doc, version: made.data.version },
    })
    .catch(() => null);
  return !!saved?.data;
}
