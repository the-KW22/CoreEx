"use server";

import { getApi } from "@/lib/api/server";
import type { components } from "@/lib/api/schema";

export type QuickHit = components["schemas"]["QuickHitResponse"];

// Called by the browser when an Item's page is shown; feeds "recently opened". Failures do not matter.
export async function recordOpened(id: string): Promise<void> {
  const api = await getApi();
  await api.POST("/api/items/{id}/open", { params: { path: { id } } }).catch(() => null);
}
