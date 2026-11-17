"use server";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

export type RunResult = { ok: true } | { ok: false; message: string };

// Runs the Fit check. The result is kept in the Application's Library; the page shows it once it is refreshed.
export async function runFit(id: string): Promise<RunResult> {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/career/fit", { params: { path: { id } } }).catch(() => null);
  if (!result) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (!result.data) {
    const error = (result as { error?: { message?: string } }).error;
    return { ok: false, message: error?.message ?? "The Fit check could not run. Try again." };
  }
  done(true);
  return { ok: true };
}
