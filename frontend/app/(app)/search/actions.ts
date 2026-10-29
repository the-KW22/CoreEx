"use server";

import { getApi } from "@/lib/api/server";
import type { components } from "@/lib/api/schema";

export type QuickHit = components["schemas"]["QuickHitResponse"];

// The quick switcher: titles close to the text, or the recently opened Items when it is empty. A failed call
// answers "nothing found" rather than an error, because the switcher is a convenience.
export async function quickSearch(text: string): Promise<QuickHit[]> {
  const api = await getApi();
  const result = await api
    .GET("/api/search/quick", { params: { query: { q: text.slice(0, 200) } } })
    .catch(() => null);
  return result?.data?.items ?? [];
}

// Called by the browser when an Item's page is shown; feeds "recently opened". Failures do not matter.
export async function recordOpened(id: string): Promise<void> {
  const api = await getApi();
  await api.POST("/api/items/{id}/open", { params: { path: { id } } }).catch(() => null);
}
