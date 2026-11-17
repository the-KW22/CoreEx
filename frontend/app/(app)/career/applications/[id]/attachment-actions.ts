"use server";

import { getApi } from "@/lib/api/server";

// The current Resume or Cover Letter of a linked Item, for making its PDF. Null when it cannot be read (it was trashed
// or is not the User's).
export async function liveDocument(kind: "RESUME" | "COVER_LETTER", itemId: string) {
  const api = await getApi();
  if (kind === "RESUME") {
    const result = await api.GET("/api/resumes/{id}", { params: { path: { id: itemId } } }).catch(() => null);
    return result?.data ? { title: result.data.title, document: result.data.document } : null;
  }
  const result = await api.GET("/api/cover-letters/{id}", { params: { path: { id: itemId } } }).catch(() => null);
  return result?.data ? { title: result.data.title, document: result.data.document } : null;
}
