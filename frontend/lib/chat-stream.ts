import { type WebSource, webSources } from "@/lib/chat";

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; status: "COMPLETE" | "STOPPED"; sources: unknown[]; web: WebSource[] }
  | { type: "error"; code: string; message: string };

// Turns one parsed event's JSON payload into a ChatEvent, or null when the fields do not match.
function toChatEvent(name: string, data: Record<string, unknown>): ChatEvent | null {
  switch (name) {
    case "text":
      return typeof data.text === "string" ? { type: "text", text: data.text } : null;
    case "tool":
      return typeof data.name === "string" ? { type: "tool", name: data.name } : null;
    case "done":
      return (data.status === "COMPLETE" || data.status === "STOPPED") && Array.isArray(data.sources)
        ? { type: "done", status: data.status, sources: data.sources, web: webSources(data.webSources) }
        : null;
    case "error":
      return typeof data.code === "string" && typeof data.message === "string"
        ? { type: "error", code: data.code, message: data.message }
        : null;
    default:
      return null; // unknown event names are ignored
  }
}

// Parses every complete SSE event in `buffer`; the unfinished tail comes back as `rest` for the next chunk.
export function parseSse(buffer: string): { events: ChatEvent[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const part of parts) {
    let name = "";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith(":")) continue; // comment line
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") name = value;
      else if (field === "data") dataLines.push(value);
    }
    if (!name || dataLines.length === 0) continue;
    try {
      const data: unknown = JSON.parse(dataLines.join("\n"));
      if (typeof data !== "object" || data === null) continue;
      const event = toChatEvent(name, data as Record<string, unknown>);
      if (event) events.push(event);
    } catch {
      // invalid JSON: drop the event
    }
  }
  return { events, rest };
}

export async function* readChatEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSse(buffer);
      buffer = parsed.rest;
      yield* parsed.events;
    }
  } finally {
    reader.releaseLock();
  }
}
