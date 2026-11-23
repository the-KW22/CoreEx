import { Conversation } from "./conversation";

// A new Chat: nothing is saved until the first message is sent.
export default function NewChatPage() {
  return <Conversation chatId={null} initialMessages={[]} initialUseNotes />;
}
