"use server";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

const MIB = 1024 * 1024;

// The Users actions answer whether they worked, so the table stays put and a toast says what happened.
async function saveQuota(id: string, bytes: number | "default"): Promise<boolean> {
  const api = await getApi();
  const result =
    bytes === "default"
      ? await api.DELETE("/api/admin/users/{id}/quota", { params: { path: { id } } }).catch(() => null)
      : await api
          .PUT("/api/admin/users/{id}/quota", { params: { path: { id } }, body: { storageQuotaBytes: bytes } })
          .catch(() => null);
  return done(!!result?.data);
}

// The form asks for megabytes; the API stores bytes.
export async function setQuota(id: string, megabytes: number): Promise<boolean> {
  if (!Number.isFinite(megabytes) || megabytes < 0) return false;
  return saveQuota(id, Math.round(megabytes * MIB));
}

export async function resetQuota(id: string): Promise<boolean> {
  return saveQuota(id, "default");
}

export type RemoveResult = "ok" | "admin" | "error";

// Deletes the person's data, files and sign-in, so their email can be invited again.
export async function removeUser(id: string): Promise<RemoveResult> {
  const api = await getApi();
  const result = await api.DELETE("/api/admin/users/{id}", { params: { path: { id } } }).catch(() => null);
  if (result?.response.ok) {
    done(true);
    return "ok";
  }
  return result?.error?.code === "CANNOT_REMOVE_ADMIN" ? "admin" : "error";
}

export type DisableResult = "ok" | "self" | "error";

export async function setDisabled(id: string, disable: boolean): Promise<DisableResult> {
  const api = await getApi();
  const params = { params: { path: { id } } };
  const result = disable
    ? await api.POST("/api/admin/users/{id}/disable", params).catch(() => null)
    : await api.POST("/api/admin/users/{id}/enable", params).catch(() => null);
  if (result?.data) {
    done(true);
    return "ok";
  }
  return result?.error?.code === "CANNOT_DISABLE_SELF" ? "self" : "error";
}
