"use server";

import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";
import type { TagColour } from "@/lib/tag-colour";

// The Tag actions answer whether they worked, so the Tags page and the Tag page can say so in a toast or in the
// Dialog and stay where they are.
export async function setTagColour(id: string, colour: TagColour | null): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .PUT("/api/tags/{id}/colour", { params: { path: { id } }, body: { colour } })
    .catch(() => null);
  return done(!!result?.data);
}

// The panel's "New Tag": a message when it did not work, nothing when it did.
export async function createTag(formData: FormData): Promise<string | void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const api = await getApi();
  const result = await api.POST("/api/tags", { body: { name } }).catch(() => null);
  if (result?.error?.code === "TAG_EXISTS") return "You already have a Tag with this name.";
  if (!done(!!result?.data)) return "Could not create the Tag. Try again.";
}

export type RenameResult = "ok" | "exists" | "error";

export async function renameTag(id: string, name: string): Promise<RenameResult> {
  const trimmed = name.trim();
  if (!trimmed) return "error";
  const api = await getApi();
  const result = await api
    .PUT("/api/tags/{id}", { params: { path: { id } }, body: { name: trimmed } })
    .catch(() => null);
  if (result?.error?.code === "TAG_EXISTS") return "exists";
  return done(!!result?.data) ? "ok" : "error";
}

// `then` is where to go afterwards: the Tag's own page is gone once it is deleted.
export async function deleteTag(id: string, then?: string): Promise<boolean> {
  const api = await getApi();
  const result = await api.DELETE("/api/tags/{id}", { params: { path: { id } } }).catch(() => null);
  if (!done(!!result && !result.error)) return false;
  if (then) redirect(then);
  return true;
}
