"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
// Restoring brings Folders back into the sidebar tree, and deleting changes the storage used, so refresh everything.
const refresh = () => revalidatePath("/", "layout");
const failed = (code: string | undefined, fallback: string) =>
  redirect(`/trash?error=${code === "STORAGE_UNAVAILABLE" ? "storage" : fallback}`);

export async function restoreEntry(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const api = await getApi();
  const result =
    text(formData, "kind") === "FOLDER"
      ? await api.POST("/api/trash/folders/{id}/restore", { params: { path: { id } } }).catch(() => null)
      : await api.POST("/api/trash/items/{id}/restore", { params: { path: { id } } }).catch(() => null);
  if (!result || result.error) redirect("/trash?error=restore");
  refresh();
}

export async function deleteEntryForGood(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const api = await getApi();
  const result =
    text(formData, "kind") === "FOLDER"
      ? await api.DELETE("/api/trash/folders/{id}", { params: { path: { id } } }).catch(() => null)
      : await api.DELETE("/api/trash/items/{id}", { params: { path: { id } } }).catch(() => null);
  if (!result || result.error) failed(result?.error?.code, "delete");
  refresh();
}

export async function emptyTrash() {
  const api = await getApi();
  const result = await api.DELETE("/api/trash").catch(() => null);
  if (!result || result.error) failed(result?.error?.code, "empty");
  refresh();
}
