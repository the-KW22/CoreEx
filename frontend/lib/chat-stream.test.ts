import { describe, expect, it } from "vitest";

import { parseSse, readChatEvents, type ChatEvent } from "./chat-stream";

describe("parseSse", () => {
  it("returns an unfinished event as rest until its blank line arrives", () => {
    const first = parseSse('event: text\ndata: {"text":"He');
    expect(first).toEqual({ events: [], rest: 'event: text\ndata: {"text":"He' });

    const second = parseSse(first.rest + 'llo"}\n\n');
    expect(second.events).toEqual([{ type: "text", text: "Hello" }]);
    expect(second.rest).toBe("");
  });

  it("handles CRLF line endings", () => {
    const { events, rest } = parseSse('event: tool\r\ndata: {"name":"search"}\r\n\r\nevent: text\r\n');
    expect(events).toEqual([{ type: "tool", name: "search" }]);
    expect(rest).toBe("event: text\n");
  });

  it("returns two events from one chunk, in order", () => {
    const { events } = parseSse(
      'event: text\ndata: {"text":"a"}\n\nevent: done\ndata: {"status":"COMPLETE","sources":[]}\n\n',
    );
    expect(events).toEqual([
      { type: "text", text: "a" },
      { type: "done", status: "COMPLETE", sources: [] },
    ]);
  });

  it("ignores unknown events, comments and invalid JSON", () => {
    const { events } = parseSse(
      ': keep-alive\n\nevent: ping\ndata: {}\n\nevent: text\ndata: {not json\n\nevent: error\ndata: {"code":"X","message":"boom"}\n\n',
    );
    expect(events).toEqual([{ type: "error", code: "X", message: "boom" }]);
  });
});

describe("readChatEvents", () => {
  it("decodes a body split mid-character and mid-event", async () => {
    const bytes = new TextEncoder().encode('event: text\ndata: {"text":"é!"}\n\n');
    const chunks = [bytes.slice(0, 15), bytes.slice(15, 25), bytes.slice(25)];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });

    const seen: ChatEvent[] = [];
    for await (const event of readChatEvents(body)) seen.push(event);
    expect(seen).toEqual([{ type: "text", text: "é!" }]);
  });
});
