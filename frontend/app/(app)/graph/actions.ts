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
