import type { components } from "@/lib/api/schema";
import { itemHref } from "@/lib/items";

export type ChatMessage = components["schemas"]["MessageView"];
export type Source = components["schemas"]["SourceView"];

// The API stores a message as blocks (text, tool_use, tool_result); the generated type names them differently from the
// JSON the API sends ("text", "tool_use", "tool_result"), so blocks are read loosely here.
type Block = { type?: string; text?: string };

// What the User sees of a stored message: its text, or null for a message that is only tool traffic.
export function messageText(message: ChatMessage): string | null {
  const text = (message.blocks as Block[])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("");
  return text.trim() ? text : null;
}

// A Note's title from a reply: its first heading or line, without Markdown marks, kept short.
export function noteTitle(markdown: string): string {
  const first = markdown.split("\n").find((line) => line.trim()) ?? "";
  const title = first.replace(/^[#>*\-\s]+/, "").replace(/[*_`]/g, "").trim();
  return (title || "Chat reply").slice(0, 80);
}

// The messages of the Chat as the page shows them: tool traffic hidden, a reply that wrote nothing kept only if it failed
// or was stopped (so the User still sees why).
export function visibleMessages(messages: ChatMessage[]): (ChatMessage & { text: string | null })[] {
  return messages
    .map((m) => ({ ...m, text: messageText(m) }))
    .filter((m) => m.text !== null || m.status === "FAILED" || m.status === "STOPPED");
}

// The notice for a failure code the API sent, in words a User can act on.
export function failureNotice(code: string | null | undefined, message?: string): string {
  switch (code) {
    case "AI_OFF":
      return "Chat is switched off right now.";
    case "AI_BUDGET_SPENT":
      return message || "You have used today's AI budget. It starts again at midnight UTC. Your saved Chats stay readable.";
    case "CHAT_BUSY":
      return "A reply is already running in this Chat.";
    default:
      // The API words an out-of-credit failure itself (it comes as AI_UNAVAILABLE with a message of its own).
      return message || "Chat could not answer just now. Try again, or use Search to find your Notes.";
  }
}

// Every failure but a busy Chat gets a link to Search: waiting for a reply to finish is the only thing that helps there.
export const offersSearch = (code: string | null | undefined) => code !== "CHAT_BUSY";

// A source opens its Item; a Note found under a heading opens at that heading.
export const sourceHref = (s: Source) => (s.type === "NOTE" && s.heading ? `${itemHref(s)}?heading=${encodeURIComponent(s.heading)}` : itemHref(s));

// A page the provider retrieved for a reply (docs/DESIGN.md section 6.14). Only what the API reports is shown, and only
// web addresses: a link the model typed is never a source, and anything else (javascript:, data:) is dropped here too.
export type WebSource = { url: string; title: string };

export function webSources(value: unknown): WebSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const found: WebSource[] = [];
  for (const item of value) {
    const { url, title } = (item ?? {}) as { url?: unknown; title?: unknown };
    if (typeof url !== "string" || seen.has(url)) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      seen.add(url);
      found.push({ url, title: typeof title === "string" && title.trim() ? title.trim() : parsed.hostname });
    } catch {
      // not a web address: dropped
    }
  }
  return found;
}

// The site a web source is from, for the link text.
export const siteOf = (url: string) => new URL(url).hostname.replace(/^www./, "");
