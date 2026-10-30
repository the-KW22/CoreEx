"use server";

import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
// An empty choice in a menu means the top level.
const orNull = (value: string) => value || null;

// The sidebar shows the Folder tree on every page, so a change refreshes all of them (`done`).
export async function createFolder(formData: FormData) {
  const name = text(formData, "name");
  if (!name) return;

  const api = await getApi();
  const result = await api
    .POST("/api/folders", { body: { name, parentId: orNull(text(formData, "parentId")) } })
    .catch(() => null);
  if (!result?.data) redirect("/?failed=folder");
  done(true);
}

// The Folder page's actions answer whether they worked, so its Dialogs can say so and the page stays where it is.
export async function createSubfolder(parentId: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const api = await getApi();
  const result = await api.POST("/api/folders", { body: { name: trimmed, parentId } }).catch(() => null);
  return done(!!result?.data);
}

export async function renameFolderTo(id: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const api = await getApi();
  const result = await api
    .PUT("/api/folders/{id}", { params: { path: { id } }, body: { name: trimmed } })
    .catch(() => null);
  return done(!!result?.data);
}

export type MoveResult = "ok" | "cycle" | "error";

export async function moveFolderTo(id: string, parentId: string | null): Promise<MoveResult> {
  const api = await getApi();
  const result = await api
    .POST("/api/folders/{id}/move", { params: { path: { id } }, body: { parentId } })
    .catch(() => null);
  if (result?.data) {
    done(true);
    return "ok";
  }
  return result?.error?.code === "FOLDER_CYCLE" ? "cycle" : "error";
}

// Moves the Folder and everything in it to the Trash, then goes back to where it was: its parent, or All Items.
export async function trashFolder(id: string, parentId: string | null): Promise<boolean> {
  const api = await getApi();
  const result = await api.DELETE("/api/folders/{id}", { params: { path: { id } } }).catch(() => null);
  if (!done(!!result && !result.error)) return false;
  redirect(parentId ? `/folders/${parentId}` : "/items");
}
