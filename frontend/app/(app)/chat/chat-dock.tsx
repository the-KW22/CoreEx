"use client";

import { MaximizeIcon, MessageCircleIcon, PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ASK_EVENT, takePrepared } from "@/lib/chat-context";

import { loadChat, loadDock } from "./actions";
import { Conversation } from "./conversation";
import { type Usage, UsageBar } from "./usage-bar";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadDock>>>;
type State = "loading" | "error" | Loaded;

// The floating Chat button on every signed-in page, and the panel it opens (docs/DESIGN.md section 6.14). The panel shows
// the same saved Chats as /chat: the most recent one, or a new one. It is not modal, so the page stays readable behind it.
export function ChatDock() {
  const pathname = usePathname();
  const onChatPage = pathname === "/chat" || pathname.startsWith("/chat/");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>("loading");
  // A message prepared by another screen; `n` changes with each, so the box starts again with it.
  const [seed, setSeed] = useState({ text: "", n: 0 });
  // The id of a Chat made from this panel, until the panel has loaded it.
  const [startedId, setStartedId] = useState<string | null>(null);
  const loaded = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // `fresh` opens a new Chat instead of the latest one.
  const load = useCallback(async (fresh = false) => {
    const result = await loadDock().catch(() => null);
    setState(result ? (fresh ? { ...result, chat: null } : result) : "error");
    loaded.current = result !== null;
  }, []);

  const show = useCallback(
    (text?: string) => {
      setOpen(true);
      if (text) {
        // A prepared message goes in a new Chat, so it does not land in the middle of an old one.
        setStartedId(null);
        setSeed((s) => ({ text, n: s.n + 1 }));
        if (loaded.current) setState((s) => (typeof s === "object" ? { chat: null, usage: s.usage } : s));
        else void load(true);
      } else if (!loaded.current) {
        void load();
      }
    },
    [load],
  );

  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  // Ctrl+J opens and closes the panel from anywhere (docs/DESIGN.md section 6.14); a prepared message opens it too.
  useEffect(() => {
    if (onChatPage) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        if (open) close();
        else show();
      }
    };
    const onAsk = () => show(takePrepared() ?? undefined);
    window.addEventListener("keydown", onKey);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ASK_EVENT, onAsk);
    };
  }, [onChatPage, open, show, close]);

  const ready = typeof state === "object";
  const chat = ready ? state.chat : null;
  const chatKey = `${chat?.id ?? "new"}-${seed.n}`;
  // Puts the cursor in the message box when the panel opens, or starts again with a prepared message.
  useEffect(() => {
    if (open && ready) panel.current?.querySelector("textarea")?.focus();
  }, [open, ready, chatKey]);

  const reload = useCallback(async () => {
    const id = startedId ?? (typeof state === "object" ? state.chat?.id : null);
    const result = id ? await loadChat(id).catch(() => null) : null;
    if (result) setState(result);
  }, [state, startedId]);

  function newChat() {
    setStartedId(null);
    setSeed((s) => ({ text: "", n: s.n + 1 }));
    setState((s) => (typeof s === "object" ? { chat: null, usage: s.usage } : s));
  }

  if (onChatPage) return null;
  const chatId = chat?.id ?? startedId;
  return (
    <>
      {open && (
        <section
          ref={panel}
          id="chat-dock"
          role="dialog"
          aria-modal="false"
          aria-label="Chat"
          tabIndex={-1}
          onKeyDown={(e) => {
            // Escape inside a Dialog of the panel (a Preview, Delete Chat) closes that Dialog only.
            if (e.key === "Escape" && !e.defaultPrevented && panel.current?.contains(e.target as Node)) close();
          }}
          className="fixed z-50 flex min-h-0 flex-col gap-2 border-border bg-background p-3 shadow-xl max-md:inset-0 md:right-4 md:bottom-20 md:h-[600px] md:max-h-[calc(100dvh-6rem)] md:w-[400px] md:rounded-[14px] md:border"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Chat</p>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" onClick={newChat} aria-label="New chat">
                    <PlusIcon aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New chat</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon">
                    <Link href={chatId ? `/chat/${chatId}` : "/chat"} onClick={() => setOpen(false)} aria-label="Expand to the Chat page">
                      <MaximizeIcon aria-hidden />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Expand</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close Chat">
                    <XIcon aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close (Esc)</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
          {state === "error" && (
            <div className="grid justify-items-start gap-2">
              <p role="alert" className="text-sm text-destructive">
                Could not load Chat. Try again.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}
          {typeof state === "object" && (
            <>
              <UsageBar usage={state.usage as Usage | null} />
              <Conversation
                key={chatKey}
                chatId={chat?.id ?? null}
                initialMessages={chat?.messages ?? []}
                initialProposals={chat?.proposals ?? []}
                initialUseNotes={chat?.useNotes ?? true}
                career={chat?.career}
                initialDraft={seed.text}
                dock={{
                  onStarted: (id) => {
                    setStartedId(id);
                    void loadChat(id).then((result) => result && setState(result));
                  },
                  reload: () => void reload(),
                }}
              />
            </>
          )}
        </section>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={button}
            type="button"
            aria-label={open ? "Close Chat" : "Open Chat"}
            aria-expanded={open}
            aria-controls="chat-dock"
            aria-keyshortcuts="Control+J Meta+J"
            onClick={() => (open ? close() : show())}
            className="fixed right-4 bottom-4 z-40 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <MessageCircleIcon aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{open ? "Close Chat" : "Open Chat"} (Ctrl+J)</TooltipContent>
      </Tooltip>
    </>
  );
}
