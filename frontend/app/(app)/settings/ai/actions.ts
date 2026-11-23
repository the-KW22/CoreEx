"use server";

import { revalidatePath } from "next/cache";

import { getApi } from "@/lib/api/server";

export type KeyState = { error?: string; saved?: boolean } | undefined;

// The model the User's Chats use. Answers whether it worked, so the select stays put and a toast says so.
export async function saveModel(model: string): Promise<boolean> {
  const api = await getApi();
  const result = await api.PUT("/api/ai/preferences/model", { body: { model } }).catch(() => null);
  revalidatePath("/settings/ai");
  return !!result?.response.ok;
}

// Saves the User's own key. The API checks it with the provider first, so a wrong key fails here and nothing is stored.
// The key is passed straight on: it is never put in the page, a URL or the returned state.
export async function saveKey(_previous: KeyState, formData: FormData): Promise<KeyState> {
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { error: "Enter your key." };
  const api = await getApi();
  const result = await api.PUT("/api/ai/key", { body: { provider: "anthropic", key } }).catch(() => null);
  if (!result) return { error: "Cannot reach the CoreEx API." };
  if (!result.response.ok) return { error: result.error?.message ?? "Could not save the key. Try again." };
  revalidatePath("/settings/ai");
  return { saved: true };
}

// Deletes the stored key: Chat goes back to the Shared key and its budget.
export async function removeKey(): Promise<boolean> {
  const api = await getApi();
  const result = await api.DELETE("/api/ai/key").catch(() => null);
  revalidatePath("/settings/ai");
  return !!result?.response.ok;
}
