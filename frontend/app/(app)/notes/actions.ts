"use server";

import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

export type SaveResult =
  | { status: "saved"; version: number; updatedAt: string }
  | { status: "conflict" }
  | { status: "error"; message: string };

export type LoadedNote = { title: string; body: string; version: number; updatedAt: string };

// A Folder id in the form (the Folder being viewed) files the new Note there; without one it is top level.
export async function createNote(formData: FormData) {
  const folderId = String(formData.get("folderId") ?? "") || null;
  const api = await getApi();
  const result = await api.POST("/api/notes", { body: { folderId } }).catch(() => null);
  if (!result?.data) redirect(folderId ? `/folders/${folderId}?error=create` : "/?failed=create");
  redirect(`/notes/${result.data.id}`);
}

// With overwrite, the Note's current version is read first, so the caller's text wins over what is stored.
export async function saveNote(
  id: string,
  title: string,
  body: string,
  version: number,
  overwrite: boolean,
): Promise<SaveResult> {
  const api = await getApi();
  let seen = version;
  if (overwrite) {
    const current = await api
      .GET("/api/notes/{id}", { params: { path: { id } } })
      .catch(() => null);
    if (!current?.data) return { status: "error", message: "Could not reach the Note to overwrite it." };
    seen = current.data.version;
  }

  const result = await api
    .PUT("/api/notes/{id}", { params: { path: { id } }, body: { title, body, version: seen } })
    .catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  if (result.data) return { status: "saved", version: result.data.version, updatedAt: result.data.updatedAt };
  if (result.response.status === 409) return { status: "conflict" };
  return { status: "error", message: result.error?.message ?? "Could not save the Note." };
}

export async function loadNote(id: string): Promise<LoadedNote | null> {
  const api = await getApi();
  const result = await api.GET("/api/notes/{id}", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

export async function deleteNote(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const api = await getApi();
  await api.DELETE("/api/notes/{id}", { params: { path: { id } } }).catch(() => null);
  // Success or not, the Note list is the place to see where things stand.
  redirect("/");
}
