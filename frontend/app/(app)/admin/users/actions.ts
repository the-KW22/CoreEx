"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

const MIB = 1024 * 1024;
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function saveQuota(id: string, bytes: number | null) {
  const api = await getApi();
  const result = await api
    .PUT("/api/admin/users/{id}/quota", { params: { path: { id } }, body: { storageQuotaBytes: bytes } })
    .catch(() => null);
  if (!result?.data) redirect("/admin/users?error=quota");
  revalidatePath("/admin/users");
}

// The form asks for megabytes; the API stores bytes.
export async function setQuota(formData: FormData) {
  const id = text(formData, "id");
  const megabytes = Number(text(formData, "megabytes"));
  if (!id) return;
  if (!Number.isFinite(megabytes) || megabytes < 0) redirect("/admin/users?error=quota");
  await saveQuota(id, Math.round(megabytes * MIB));
}

export async function useDefaultQuota(formData: FormData) {
  const id = text(formData, "id");
  if (id) await saveQuota(id, null);
}

export async function setDisabled(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const api = await getApi();
  const params = { params: { path: { id } } };
  const result =
    text(formData, "disable") === "true"
      ? await api.POST("/api/admin/users/{id}/disable", params).catch(() => null)
      : await api.POST("/api/admin/users/{id}/enable", params).catch(() => null);
  if (!result?.data) {
    redirect(`/admin/users?error=${result?.error?.code === "CANNOT_DISABLE_SELF" ? "self" : "status"}`);
  }
  revalidatePath("/admin/users");
}
