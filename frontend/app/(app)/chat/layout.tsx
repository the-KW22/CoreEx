import { getApi } from "@/lib/api/server";

import { ChatFrame } from "./chat-frame";

// The Chat list beside the conversation (docs/DESIGN.md section 6.12).
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const api = await getApi();
  const result = await api.GET("/api/chats").catch(() => null);
  return <ChatFrame chats={result?.data?.items ?? null}>{children}</ChatFrame>;
}
