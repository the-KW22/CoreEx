import { MessageCircleIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { startHref, type ChatStart } from "@/lib/chat";

// Starts a new Career or Application Chat. The Chat is made when the first message is sent.
export function CareerChatLink({ start, children }: { start: ChatStart; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={startHref(start)}>
        <MessageCircleIcon aria-hidden /> {children}
      </Link>
    </Button>
  );
}
