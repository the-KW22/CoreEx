"use client";

import { MessageCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { askChat } from "@/lib/chat-context";

// Opens the Chat panel with a message already written; the User still sends it. The text is held in memory only.
export function AskChat({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => askChat(text)}>
      <MessageCircleIcon aria-hidden /> {children}
    </Button>
  );
}

// The same as an icon button for a header, with a Tooltip.
export function AskChatIcon({ text, label }: { text: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={() => askChat(text)}>
          <MessageCircleIcon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
