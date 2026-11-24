import { newCareerSetup, readStart } from "@/lib/chat";

import { Conversation } from "./conversation";

// A new Chat: nothing is saved until the first message is sent. ?scope=career or ?scope=application&application=<id> starts
// a Career or Application Chat, which keeps that scope for good.
export default async function NewChatPage({ searchParams }: PageProps<"/chat">) {
  const { scope, application } = await searchParams;
  const start = readStart(scope, application);
  return <Conversation key={start ? JSON.stringify(start) : "general"} chatId={null} initialMessages={[]} initialProposals={[]} initialUseNotes={!start} career={start ? newCareerSetup(start) : undefined} />;
}
