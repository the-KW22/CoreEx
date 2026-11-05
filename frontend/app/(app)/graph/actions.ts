"use server";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

const scope = (folderId: string | null) => ({ query: { folderId: folderId ?? undefined } });

// Saves where a node was dropped. No refresh: the graph already shows it there, and a refresh would lay it out again.
export async function savePosition(itemId: string, folderId: string | null, x: number, y: number): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .PUT("/api/links/graph/positions/{itemId}", { params: { path: { itemId }, ...scope(folderId) }, body: { x, y } })
    .catch(() => null);
  return !!result && !result.error;
}

export async function resetLayout(folderId: string | null): Promise<boolean> {
  const api = await getApi();
  const result = await api.DELETE("/api/links/graph/positions", { params: scope(folderId) }).catch(() => null);
  return done(!!result && !result.error);
}

// What is linked to or from an Item, to add to a graph on screen. No refresh: the graph adds them to what it shows.
export async function loadNeighbours(itemId: string) {
  const api = await getApi();
  const result = await api.GET("/api/items/{id}/graph", { params: { path: { id: itemId }, query: { depth: 1 } } }).catch(() => null);
  return result?.data ?? null;
}

// Notes close in meaning and not linked. Asked for only when Similar is on. Null when it could not be asked.
export async function loadSuggestions(folderId: string | null) {
  const api = await getApi();
  const result = await api.GET("/api/links/graph/suggestions", { params: scope(folderId) }).catch(() => null);
  return result?.data?.items ?? null;
}

// Link it for a Suggested Link: `noteId` gains a Link to `targetId`.
export async function linkSuggestion(targetId: string, noteId: string): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .POST("/api/items/{id}/suggested-links/{noteId}", { params: { path: { id: targetId, noteId } } })
    .catch(() => null);
  return done(!!result && !result.error);
}
