"use client";

import { BriefcaseIcon, MessageSquarePlusIcon, MessagesSquareIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { type ChatScope, scopeLabel, startHref } from "@/lib/chat";
import { cn } from "@/lib/utils";

type Entry = { id: string; title: string; lastUsedAt: string; scope?: string };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function ChatList({ chats, current, onPick }: { chats: Entry[] | null; current: string; onPick?: () => void }) {
  return (
    <nav aria-label="Chats" className="grid content-start gap-1">
      <Button asChild variant="outline" size="sm" className="mb-2 justify-start">
        <Link href="/chat" onClick={onPick}>
          <MessageSquarePlusIcon aria-hidden /> New chat
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="mb-2 justify-start">
        <Link href={startHref({ scope: "CAREER" })} onClick={onPick}>
          <BriefcaseIcon aria-hidden /> New Career chat
        </Link>
      </Button>
      {chats === null && <p role="alert" className="text-sm text-muted-foreground">Could not load your Chats.</p>}
      {chats?.length === 0 && <p className="text-sm text-muted-foreground">No Chats yet.</p>}
      {chats?.map((c) => (
        <Link
          key={c.id}
          href={`/chat/${c.id}`}
          onClick={onPick}
          aria-current={current === c.id ? "page" : undefined}
          className={cn("grid gap-0.5 rounded-md px-2.5 py-2 text-sm hover:bg-surface", current === c.id && "bg-surface")}
        >
          <span className="truncate font-medium">{c.title}</span>
          <span className="text-xs text-muted-foreground">
            {scopeLabel(c.scope as ChatScope | undefined) ? `${scopeLabel(c.scope as ChatScope | undefined)} · ` : ""}
            {when(c.lastUsedAt)}
          </span>
        </Link>
      ))}
    </nav>
  );
}

// The Chat list on the left, the conversation on the right. On a phone the list is behind a button, in a Sheet.
export function ChatFrame({ chats, children }: { chats: Entry[] | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname.split("/")[2] ?? "";
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto grid h-[calc(100dvh-6.5rem)] max-w-5xl gap-6 md:h-[calc(100dvh-4rem)] md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 overflow-y-auto md:block">
        <ChatList chats={chats} current={current} />
      </aside>
      <section aria-label="Conversation" className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-2 md:hidden">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <MessagesSquareIcon aria-hidden /> Chats
          </Button>
        </div>
        {children}
      </section>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 max-w-[calc(100vw-3rem)] border-border bg-panel p-4 pt-12">
          <SheetTitle className="sr-only">Chats</SheetTitle>
          <ChatList chats={chats} current={current} onPick={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
