"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
// An empty choice in a menu means the top level.
const orNull = (value: string) => value || null;
// The sidebar shows the Folder tree on every page, so a change refreshes all of them.
const refresh = () => revalidatePath("/", "layout");

export async function createFolder(formData: FormData) {
  const name = text(formData, "name");
  if (!name) return;

  const api = await getApi();
  const result = await api
    .POST("/api/folders", { body: { name, parentId: orNull(text(formData, "parentId")) } })
    .catch(() => null);
  if (!result?.data) redirect("/?failed=folder");
  refresh();
}

export async function renameFolder(formData: FormData) {
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id || !name) return;

  const api = await getApi();
  const result = await api
    .PUT("/api/folders/{id}", { params: { path: { id } }, body: { name } })
    .catch(() => null);
  if (!result?.data) redirect(`/folders/${id}?error=rename`);
  refresh();
}

export async function moveFolder(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const api = await getApi();
  const result = await api
    .POST("/api/folders/{id}/move", {
      params: { path: { id } },
      body: { parentId: orNull(text(formData, "parentId")) },
    })
    .catch(() => null);
  if (!result?.data) {
    redirect(`/folders/${id}?error=${result?.error?.code === "FOLDER_CYCLE" ? "cycle" : "move"}`);
  }
  refresh();
}

export async function deleteFolder(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;

  const api = await getApi();
  const result = await api.DELETE("/api/folders/{id}", { params: { path: { id } } }).catch(() => null);
  if (!result || result.error) redirect(`/folders/${id}?error=delete`);
  refresh();
  // Back to where the Folder was: its parent, or All Items. Only a Folder id is accepted from the form.
  const parentId = text(formData, "parentId");
  redirect(/^[0-9a-f-]{36}$/i.test(parentId) ? `/folders/${parentId}` : "/items");
}
