import { describe, expect, it } from "vitest";

import { type ChatMessage, type Source, failureNotice, messageText, noteTitle, offersSearch, sourceHref, visibleMessages } from "./chat";

const message = (blocks: unknown[], status = "COMPLETE"): ChatMessage =>
  ({ id: "1", role: "ASSISTANT", blocks, status, sources: [], createdAt: "" }) as unknown as ChatMessage;

describe("noteTitle", () => {
  it("takes the first heading or line without Markdown marks", () => {
    expect(noteTitle("# A 7-day **Java** plan\n\nDay 1")).toBe("A 7-day Java plan");
    expect(noteTitle("\n\n- first line")).toBe("first line");
  });

  it("falls back and stays short", () => {
    expect(noteTitle("")).toBe("Chat reply");
    expect(noteTitle("x".repeat(200))).toHaveLength(80);
  });
});

describe("what a Chat shows", () => {
  it("shows only the text of a message, never tool traffic", () => {
    expect(messageText(message([{ type: "text", text: "Hi" }, { type: "tool_use", name: "search" }]))).toBe("Hi");
    expect(messageText(message([{ type: "tool_result", content: "secret" }]))).toBeNull();
  });

  it("hides a message with no text unless it failed or was stopped", () => {
    const shown = visibleMessages([message([{ type: "tool_use" }]), message([], "FAILED"), message([], "STOPPED")]);
    expect(shown.map((m) => m.status)).toEqual(["FAILED", "STOPPED"]);
  });

  it("words a failure, preferring the API's own message", () => {
    expect(failureNotice("AI_OFF")).toMatch(/switched off/);
    expect(failureNotice("AI_UNAVAILABLE", "Out of credit.")).toBe("Out of credit.");
    expect(failureNotice(null)).toMatch(/Search/);
  });

  it("says when the budget starts again", () => {
    expect(failureNotice("AI_BUDGET_SPENT")).toMatch(/starts again at midnight UTC/);
  });

  it("offers Search for every failure but a busy Chat", () => {
    expect(offersSearch("AI_OFF")).toBe(true);
    expect(offersSearch(null)).toBe(true);
    expect(offersSearch("CHAT_BUSY")).toBe(false);
  });
});

describe("sourceHref", () => {
  const source = (type: Source["type"], heading: string | null): Source => ({ id: "n1", type, title: "T", removed: false, heading });

  it("opens a Note at the heading its piece sat under", () => {
    expect(sourceHref(source("NOTE", "Soil & water"))).toBe("/notes/n1?heading=Soil%20%26%20water");
  });

  it("opens a Note without a heading, or any other Item, as it is", () => {
    expect(sourceHref(source("NOTE", null))).toBe("/notes/n1");
    expect(sourceHref(source("RESUME", "x"))).toBe("/career/resumes/n1");
  });
});
