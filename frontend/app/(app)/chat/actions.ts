"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { type ChatStart, careerSetup, noteTitle } from "@/lib/chat";

// A new, empty Chat (of a Career or Application scope when given); its id, or null when the API could not make one.
export async function createChat(start: ChatStart | null = null): Promise<string | null> {
  const api = await getApi();
  const result = await api.POST("/api/chats", { body: start ? { scope: start.scope, applicationId: start.scope === "APPLICATION" ? start.applicationId : null } : undefined }).catch(() => null);
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

// Approves or rejects Proposals the User has seen. A batch is applied all or nothing on the server. No redirect: the caller refreshes the page.
export async function answerProposals(chatId: string, ids: string[], decision: "APPROVE" | "REJECT", edits: Record<string, string>): Promise<{ ok: true } | { error: string }> {
  const api = await getApi();
  const result = await api.POST("/api/chats/{id}/proposals/answer", { params: { path: { id: chatId } }, body: { ids, decision, edits } }).catch(() => null);
  if (!result?.data) return { error: result?.error?.message ?? "Could not save your answer. Try again." };
  return { ok: true };
}

// What the floating Chat panel opens with: the User's most recent Chat (or none, for a new one) and today's AI budget.
// null when the API could not be reached.
export async function loadDock() {
  const api = await getApi();
  const [list, usage] = await Promise.all([api.GET("/api/chats").catch(() => null), api.GET("/api/ai/usage").catch(() => null)]);
  if (!list?.data) return null;
  const latest = list.data.items[0];
  const detail = latest ? await api.GET("/api/chats/{id}", { params: { path: { id: latest.id } } }).catch(() => null) : null;
  if (latest && !detail?.data) return null;
  return { chat: latest && detail?.data ? { id: latest.id, messages: detail.data.messages, proposals: detail.data.proposals, useNotes: detail.data.useNotes, career: careerSetup(detail.data) } : null, usage: usage?.data ?? null };
}

// One Chat again, after a reply, so the panel shows what the server stored.
export async function loadChat(id: string) {
  const api = await getApi();
  const [detail, usage] = await Promise.all([api.GET("/api/chats/{id}", { params: { path: { id } } }).catch(() => null), api.GET("/api/ai/usage").catch(() => null)]);
  if (!detail?.data) return null;
  return { chat: { id, messages: detail.data.messages, proposals: detail.data.proposals, useNotes: detail.data.useNotes, career: careerSetup(detail.data) }, usage: usage?.data ?? null };
}
