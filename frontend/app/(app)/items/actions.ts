"use server";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

// The Item list's row actions. Unlike the form actions on an Item's own page, these answer whether they worked, so
// the list can say so in a toast and stay where it is.
export type ItemType = "NOTE" | "ASSET" | "APPLICATION";

export async function moveItemTo(id: string, folderId: string | null): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .POST("/api/items/{id}/move", { params: { path: { id } }, body: { folderId } })
    .catch(() => null);
  return done(!!result?.data);
}

export async function tagItem(id: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const api = await getApi();
  const result = await api
    .POST("/api/items/{id}/tags", { params: { path: { id } }, body: { name: trimmed } })
    .catch(() => null);
  return done(!!result?.data);
}

export async function untagItem(id: string, tagId: string): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .DELETE("/api/items/{id}/tags/{tagId}", { params: { path: { id, tagId } } })
    .catch(() => null);
  return done(!!result && !result.error);
}

// shortcut: an Application cannot go to the Trash yet (it answers false), until #239 adds it.
export async function trashItem(id: string, type: ItemType): Promise<boolean> {
  if (type === "APPLICATION") return false;
  const api = await getApi();
  const result = await (type === "NOTE"
    ? api.DELETE("/api/notes/{id}", { params: { path: { id } } })
    : api.DELETE("/api/assets/{id}", { params: { path: { id } } })
  ).catch(() => null);
  return done(!!result && !result.error);
}

export async function restoreItem(id: string): Promise<boolean> {
  const api = await getApi();
  const result = await api.POST("/api/trash/items/{id}/restore", { params: { path: { id } } }).catch(() => null);
  return done(!!result && !result.error);
}

// Link it: turns a plain mention into a Link in the other Note. Any answer refreshes, so a conflict offers the new version.
export async function linkMention(itemId: string, noteId: string, version: number): Promise<"linked" | "conflict" | "error"> {
  const api = await getApi();
  const result = await api
    .POST("/api/items/{id}/mentions/{noteId}/link", { params: { path: { id: itemId, noteId } }, body: { version } })
    .catch(() => null);
  done(true);
  if (result?.response.status === 409) return "conflict";
  return result && !result.error ? "linked" : "error";
}
