"use client";

import { ArrowUpIcon, FileTextIcon, GlobeIcon, SquareIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";

import { ChatMarkdown } from "@/components/chat-markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ChatMessage, type Source, type WebSource, failureNotice, offersSearch, siteOf, sourceHref, visibleMessages, webSources } from "@/lib/chat";
import { chatContext } from "@/lib/chat-context";
import { readChatEvents } from "@/lib/chat-stream";
import { type Proposal, groupByMessage, pendingQuestion } from "@/lib/proposals";

import { createChat, deleteChat, saveAsNote, stopChat } from "./actions";
import { ProposalCards } from "./proposal-cards";
import { QuestionCard } from "./question-card";

const USE_WEB_HELP = "On: for this message only, the model can search the web and read pages (up to 5 searches). Your question and what it looks up are sent to the search provider. Nothing from your Notes should be put in a search, but that is an instruction to the model, not something CoreEx can enforce.";

const USE_NOTES_HELP = "Off: nothing from your Notes is sent for this message, and the model gets no way to read them. Quotes already in this Chat stay in its history.";

// A reply being written now, or just finished and not yet reloaded from the server.
type Pending = { user: string; text: string; tool: string | null; status: "WORKING" | "COMPLETE" | "STOPPED" | "FAILED"; sources: Source[]; web: WebSource[] };

function SourceList({ sources, web }: { sources: Source[]; web: WebSource[] }) {
  if (sources.length === 0 && web.length === 0) return null;
  return (
    <div className="mt-2 grid gap-1 text-sm">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      <ul className="flex flex-wrap gap-2">
        {web.map((w) => (
          <li key={w.url}>
            {/* A page the provider retrieved. It opens on its own site, in a new tab, and gets nothing from CoreEx. */}
            <a href={w.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface">
              <GlobeIcon aria-hidden className="size-3.5" /> {w.title} <span className="text-muted-foreground">({siteOf(w.url)})</span>
              <span className="sr-only"> web page, opens in a new tab</span>
            </a>
          </li>
        ))}
        {sources.map((s) => (
          <li key={s.id}>
            {s.removed ? (
              <span className="rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground">{s.title} (removed)</span>
            ) : (
              <Link href={sourceHref(s)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface">
                <FileTextIcon aria-hidden className="size-3.5" /> {s.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveAsNote({ text }: { text: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        size="xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await saveAsNote(text);
            if (result) setError(result.error);
          })
        }
      >
        {pending ? "Saving…" : "Save as Note"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

// A failure in words, with a link to Search when that is a way out.
function Notice({ text, search }: { text: string; search: boolean }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {text}
      {search && (
        <>
          {" "}
          <Link href="/search" className="underline underline-offset-4">
            Search your Notes
          </Link>
        </>
      )}
    </p>
  );
}

type Problem = { text: string; search: boolean };

function Reply({ text, status, sources, web = [], errorCode, working }: { text: string; status: string; sources: Source[]; web?: WebSource[]; errorCode?: string | null; working?: string | null }) {
  const busy = status === "STREAMING" || status === "WORKING";
  return (
    <article aria-label="Reply" className="max-w-[min(100%,48rem)] justify-self-start">
      {text ? <ChatMarkdown>{text}</ChatMarkdown> : null}
      {busy && <p className="text-sm text-muted-foreground">{working ? `Working (${working.replaceAll("_", " ")})…` : "Working…"}</p>}
      {status === "STOPPED" && <p className="text-xs font-medium text-muted-foreground">Stopped</p>}
      {status === "FAILED" && <Notice text={failureNotice(errorCode)} search={offersSearch(errorCode)} />}
      <SourceList sources={sources} web={web} />
      {text && !busy && (
        <div className="mt-1">
          <SaveAsNote text={text} />
        </div>
      )}
    </article>
  );
}

// One Chat's conversation and message box. `chatId` is null on /chat: the Chat is made when the first message is sent.
export function Conversation({
  chatId,
  initialMessages,
  initialProposals,
  initialUseNotes,
  initialDraft = "",
  dock,
}: {
  chatId: string | null;
  initialMessages: ChatMessage[];
  initialProposals: Proposal[];
  initialUseNotes: boolean;
  /** A message prepared by another screen; the User still sends it. */
  initialDraft?: string;
  /** In the floating panel: no navigation, the panel reloads the Chat itself and has its own header. */
  dock?: { onStarted: (id: string) => void; reload: () => void };
}) {
  const router = useRouter();
  const [seen, setSeen] = useState(initialMessages);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [useNotes, setUseNotes] = useState(initialUseNotes);
  // The web is off for every message until the User turns it on, and goes off again once it is sent.
  const [useWeb, setUseWeb] = useState(false);
  // A new Chat is made on the first send; keep its id, so a retry after a refusal, and Stop, use it.
  const [startedId, setStartedId] = useState<string | null>(null);
  const activeId = chatId ?? startedId;
  const refresh = () => (dock ? dock.reload() : router.refresh());
  const [notice, setNotice] = useState<Problem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [announce, setAnnounce] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const [deleting, startDelete] = useTransition();

  // The server's copy has arrived: it replaces what was shown while the reply was written.
  if (seen !== initialMessages) {
    setSeen(initialMessages);
    setPending(null);
  }

  const messages = visibleMessages(initialMessages);
  const shown = new Map(messages.map((m) => [m.id, m]));
  // A message with only tool calls shows nothing itself, but the Proposals it made still show under it.
  const proposalsByMessage = groupByMessage(initialProposals);
  // Only a real stored call that nothing has answered makes a card; text the model writes never does.
  const question = pending ? null : pendingQuestion(initialMessages);
  const last = initialMessages.at(-1);
  const running = pending?.status === "WORKING";
  // A reply started elsewhere (another tab, or before a reload) is still being written: look again until it ends.
  const elsewhere = !pending && last?.status === "STREAMING";

  useEffect(() => {
    if (!elsewhere) return;
    const timer = setInterval(() => (dock ? dock.reload() : router.refresh()), 3000);
    return () => clearInterval(timer);
  }, [elsewhere, router, dock]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, pending?.text]);

  async function send() {
    const text = draft.trim();
    if (!text || running) return;
    setNotice(null);
    const id = await ensureChat();
    if (!id) return;
    setDraft("");
    const web = useWeb;
    setUseWeb(false);
    await stream(id, "", { text, useNotes, useWeb: web, context: chatContext() }, text, () => {
      setDraft(text);
      setUseWeb(web);
    });
  }

  // A new Chat is made on the first send (or the first answer).
  async function ensureChat(): Promise<string | null> {
    if (activeId) return activeId;
    const made = await createChat();
    if (!made) {
      setNotice({ text: failureNotice(null), search: true });
      return null;
    }
    setStartedId(made);
    return made;
  }

  // The answer to the question card continues the same conversation: it streams like a sent message.
  async function answerQuestion(toolUseId: string, text: string) {
    if (running || !activeId) return;
    setNotice(null);
    await stream(activeId, "/answer", { toolUseId, text }, text, () => undefined);
  }

  // Streams a reply from the route `path` under the Chat. `shown` is the User's side of it; a refusal before anything is
  // stored calls `restore`, so nothing the User typed is lost.
  async function stream(id: string, path: "" | "/answer", payload: object, shown: string, restore: () => void) {
    setPending({ user: shown, text: "", tool: null, status: "WORKING", sources: [], web: [] });
    setAnnounce("Working on a reply.");
    let status: Pending["status"] = "COMPLETE";
    let failure: Problem | null = null;
    try {
      const res = await fetch(`/chat-stream/${id}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        // A refusal comes before anything is stored: put the text back so nothing is lost.
        const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
        setPending(null);
        restore();
        setNotice({ text: failureNotice(body?.code, body?.message), search: offersSearch(body?.code) });
        return;
      }
      for await (const event of readChatEvents(res.body)) {
        if (event.type === "text") setPending((p) => p && { ...p, text: p.text + event.text, tool: null });
        else if (event.type === "tool") setPending((p) => p && { ...p, tool: event.name });
        else if (event.type === "done") {
          status = event.status;
          setPending((p) => p && { ...p, sources: event.sources as Source[], web: event.web });
        } else if (event.type === "error") {
          status = "FAILED";
          failure = { text: failureNotice(event.code, event.message), search: offersSearch(event.code) };
        }
      }
    } catch {
      // The tab lost the connection; the reply keeps running on the server, so the reload shows how it ended.
      failure = { text: "The connection was lost. Reload to see how the reply ended.", search: false };
      status = "FAILED";
    }
    setPending((p) => p && { ...p, status, tool: null });
    setNotice(failure);
    setAnnounce(failure?.text ?? (status === "STOPPED" ? "Reply stopped." : "Reply finished."));
    // The Chat list lives in the layout, which a soft navigation keeps: refresh it so the new or renamed Chat shows.
    if (!chatId) {
      if (dock) dock.onStarted(id);
      else router.replace(`/chat/${id}`);
    }
    refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className={dock ? "sr-only" : "flex items-center justify-between gap-2"}>
        {dock ? <h2>Chat</h2> : <h1 className="text-xl font-semibold tracking-tight">Chat</h1>}
        {activeId && !dock && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon aria-hidden /> Delete Chat
          </Button>
        )}
      </header>

      <div role="log" aria-label="Conversation" aria-live="off" className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto rounded-[14px] border border-border p-4">
        {messages.length === 0 && !pending && (
          <div className="grid justify-items-center gap-1 p-6 text-center">
            <p className="font-medium">Ask anything</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Chat can write, explain and plan, and it can search and read your Notes when that helps. Nothing in your knowledge base changes unless you change it.
            </p>
          </div>
        )}
        {initialMessages.map((raw) => {
          const m = shown.get(raw.id);
          const proposals = proposalsByMessage.get(raw.id);
          return (
            <Fragment key={raw.id}>
              {m &&
                (m.role === "USER" ? (
                  <p className="max-w-[min(100%,40rem)] justify-self-end whitespace-pre-wrap rounded-[14px] bg-surface px-3 py-2">{m.text}</p>
                ) : (
                  <Reply text={m.text ?? ""} status={m.status} sources={m.sources} web={webSources(m.webSources)} errorCode={m.errorCode} />
                ))}
              {proposals && activeId && <ProposalCards chatId={activeId} proposals={proposals} busy={running || elsewhere} onAnswered={refresh} />}
            </Fragment>
          );
        })}
        {question && !running && !elsewhere && (
          <QuestionCard
            key={question.toolUseId}
            question={question.question}
            choices={question.choices}
            disabled={running}
            onAnswer={(text) => void answerQuestion(question.toolUseId, text)}
          />
        )}
        {pending && (
          <>
            <p className="max-w-[min(100%,40rem)] justify-self-end whitespace-pre-wrap rounded-[14px] bg-surface px-3 py-2">{pending.user}</p>
            <Reply text={pending.text} status={pending.status} sources={pending.sources} web={pending.web} working={pending.tool} />
          </>
        )}
        <div ref={end} />
      </div>
      <p role="status" className="sr-only">
        {announce}
      </p>

      {notice && <Notice text={notice.text} search={notice.search} />}

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="chat-message" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          maxLength={20000}
          rows={3}
          placeholder="Ask anything. Enter sends, Shift+Enter adds a line."
          className="w-full resize-none rounded-[14px] border border-border bg-background p-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id="use-notes-help" className="sr-only">
            {USE_NOTES_HELP}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useNotes} onChange={(e) => setUseNotes(e.target.checked)} aria-describedby="use-notes-help" className="size-4" />
                Use my Notes
              </label>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              {USE_NOTES_HELP}
            </TooltipContent>
          </Tooltip>
          <span id="use-web-help" className="sr-only">
            {USE_WEB_HELP}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useWeb} onChange={(e) => setUseWeb(e.target.checked)} aria-describedby="use-web-help" className="size-4" />
                Use the web
              </label>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              {USE_WEB_HELP}
            </TooltipContent>
          </Tooltip>
          {running && activeId ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void stopChat(activeId)}>
              <SquareIcon aria-hidden /> Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!draft.trim() || running}>
              <ArrowUpIcon aria-hidden /> Send
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Your questions, the Notes that closely match them, the Notes and files the model reads are sent to Anthropic to write the reply. With the web on, what it looks up goes to the search provider too.
        </p>
      </form>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="border-border bg-popover sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Chat?</AlertDialogTitle>
            <AlertDialogDescription>The Chat and its messages are deleted for good. It does not go to the Trash.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  const result = activeId ? await deleteChat(activeId) : undefined;
                  if (result) setNotice({ text: result.error, search: false });
                })
              }
            >
              Delete Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
