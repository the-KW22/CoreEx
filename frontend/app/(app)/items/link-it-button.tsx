"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { linkMention } from "./actions";

export function LinkItButton({ itemId, noteId, version, title }: { itemId: string; noteId: string; version: number; title: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="justify-self-start"
      disabled={pending}
      aria-label={`Link it in ${title}`}
      onClick={() =>
        start(async () => {
          const result = await linkMention(itemId, noteId, version);
          if (result === "conflict") toast.error(`${title} changed just now. Check the mention and try again.`);
          else if (result === "error") toast.error("Could not make the Link. Try again.");
        })
      }
    >
      Link it
    </Button>
  );
}
