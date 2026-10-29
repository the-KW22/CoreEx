"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

export async function renameTag(formData: FormData) {
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id || !name) return;

  const api = await getApi();
  const result = await api
    .PUT("/api/tags/{id}", { params: { path: { id } }, body: { name } })
    .catch(() => null);
  if (!result?.data) {
    redirect(`/tags/${id}?error=${result?.error?.code === "TAG_EXISTS" ? "exists" : "rename"}`);
  }
  refresh();
}

export async function deleteTag(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const api = await getApi();
  const result = await api.DELETE("/api/tags/{id}", { params: { path: { id } } }).catch(() => null);
  if (!result || result.error) redirect(`/tags/${id}?error=delete`);
  refresh();
  redirect("/tags");
}
