import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { Conversation } from "../conversation";

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const api = await getApi();
  const result = await api.GET("/api/chats/{id}", { params: { path: { id } } }).catch(() => null);
  if (!result) return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  const chat = result.data;
  if (!chat) {
    if (result.response.status === 404) notFound();
    return <p role="alert">Could not load this Chat. Try again.</p>;
  }
  return <Conversation key={id} chatId={id} initialMessages={chat.messages} initialUseNotes={chat.useNotes} />;
}
