import { getApi } from "@/lib/api/server";

import { ChatFrame } from "./chat-frame";
import { UsageBar } from "./usage-bar";

// The Chat list beside the conversation (docs/DESIGN.md section 6.12), with today's AI budget above it.
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const api = await getApi();
  const [result, usage] = await Promise.all([
    api.GET("/api/chats").catch(() => null),
    api.GET("/api/ai/usage").catch(() => null),
  ]);
  return (
    <ChatFrame chats={result?.data?.items ?? null}>
      <UsageBar usage={usage?.data ?? null} />
      {children}
    </ChatFrame>
  );
}
