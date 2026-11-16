"use server";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

// The Trash actions answer whether they worked, so the list stays where it is and a toast says what happened.
// Restoring brings Folders back into the sidebar tree and deleting changes the storage used, so both refresh everything.
type Kind = "FOLDER" | "NOTE" | "ASSET" | "APPLICATION" | "RESUME" | "COVER_LETTER";
export type Removal = "ok" | "storage" | "error";

const removal = (result: { error?: { code?: string } } | null): Removal =>
  !result || result.error ? (result?.error?.code === "STORAGE_UNAVAILABLE" ? "storage" : "error") : "ok";

const finish = (result: Removal) => {
  done(result === "ok");
  return result;
};

export async function restoreEntry(kind: Kind, id: string): Promise<boolean> {
  const api = await getApi();
  const result =
    kind === "FOLDER"
      ? await api.POST("/api/trash/folders/{id}/restore", { params: { path: { id } } }).catch(() => null)
      : await api.POST("/api/trash/items/{id}/restore", { params: { path: { id } } }).catch(() => null);
  return done(!!result && !result.error);
}

export async function deleteEntryForGood(kind: Kind, id: string): Promise<Removal> {
  const api = await getApi();
  const result =
    kind === "FOLDER"
      ? await api.DELETE("/api/trash/folders/{id}", { params: { path: { id } } }).catch(() => null)
      : await api.DELETE("/api/trash/items/{id}", { params: { path: { id } } }).catch(() => null);
  return finish(removal(result));
}

export async function emptyTrash(): Promise<Removal> {
  const api = await getApi();
  const result = await api.DELETE("/api/trash").catch(() => null);
  return finish(removal(result));
}
