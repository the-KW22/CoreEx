"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { noteTitle } from "@/lib/chat";

// A new, empty Chat; its id, or null when the API could not make one.
export async function createChat(): Promise<string | null> {
  const api = await getApi();
  const result = await api.POST("/api/chats").catch(() => null);
  return result?.data?.id ?? null;
}

// Ends the running reply and keeps what it wrote. Harmless when nothing runs.
export async function stopChat(id: string): Promise<void> {
  const api = await getApi();
  await api.POST("/api/chats/{id}/stop", { params: { path: { id } } }).catch(() => null);
}

// Deletes the Chat for good (no Trash), then shows the Chat module's start page.
export async function deleteChat(id: string): Promise<{ error: string } | undefined> {
  const api = await getApi();
  const result = await api.DELETE("/api/chats/{id}", { params: { path: { id } } }).catch(() => null);
  if (!result || (result.response.status !== 204 && result.response.status !== 404)) {
    return { error: "Could not delete the Chat. Try again." };
  }
  revalidatePath("/chat", "layout");
  redirect("/chat");
}

// Makes a Note of a reply's Markdown with the existing create-Note API, then opens it.
export async function saveAsNote(markdown: string): Promise<{ error: string } | undefined> {
  const api = await getApi();
  const result = await api.POST("/api/notes", { body: { title: noteTitle(markdown), body: markdown, id: crypto.randomUUID() } }).catch(() => null);
  if (!result?.data) return { error: result?.error?.message ?? "Could not save the reply as a Note. Try again." };
  redirect(`/notes/${result.data.id}`);
}
