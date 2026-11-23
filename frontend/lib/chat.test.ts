import { describe, expect, it } from "vitest";

import { type ChatMessage, type Source, careerSetup, failureNotice, messageText, newCareerSetup, noteTitle, offersSearch, readStart, scopeLabel, sourceHref, siteOf, startHref, visibleMessages, webSources } from "./chat";

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

describe("webSources", () => {
  it("keeps web addresses, once each, and gives a missing title the site name", () => {
    expect(
      webSources([
        { url: "https://example.com/a", title: "A page" },
        { url: "https://example.com/a", title: "Again" },
        { url: "http://news.example.org/x", title: " " },
      ]),
    ).toEqual([
      { url: "https://example.com/a", title: "A page" },
      { url: "http://news.example.org/x", title: "news.example.org" },
    ]);
  });

  it("drops anything that is not a web address, and anything that is not a list", () => {
    expect(webSources([{ url: "javascript:alert(1)", title: "x" }, { url: "data:text/html,hi" }, { url: "not a url" }, null, { title: "no url" }])).toEqual([]);
    expect(webSources(undefined)).toEqual([]);
    expect(webSources("https://example.com")).toEqual([]);
  });

  it("names the site of a link without www", () => {
    expect(siteOf("https://www.example.com/a/b")).toBe("example.com");
  });
});

const APP = "0b4f6c1e-2d3a-4b5c-8d9e-0a1b2c3d4e5f";

describe("Career scope", () => {
  it("reads only a well-formed start from the address", () => {
    expect(readStart("career", undefined)).toEqual({ scope: "CAREER" });
    expect(readStart("application", APP)).toEqual({ scope: "APPLICATION", applicationId: APP });
    expect(readStart("application", "not-an-id")).toBeNull();
    expect(readStart("application", undefined)).toBeNull();
    expect(readStart("other", APP)).toBeNull();
    expect(readStart(undefined, undefined)).toBeNull();
  });

  it("builds the address that opens a new Chat of each scope", () => {
    expect(startHref(null)).toBe("/chat");
    expect(startHref({ scope: "CAREER" })).toBe("/chat?scope=career");
    expect(startHref({ scope: "APPLICATION", applicationId: APP })).toBe(`/chat?scope=application&application=${APP}`);
  });

  it("gives a general Chat no Career setup and a Career Chat both switches", () => {
    expect(careerSetup({ scope: "GENERAL" })).toBeUndefined();
    expect(careerSetup({})).toBeUndefined();
    expect(careerSetup({ scope: "CAREER", useApplications: false, useKnowledge: true })).toEqual({ scope: "CAREER", applicationId: null, useApplications: false, useKnowledge: true });
    expect(careerSetup({ scope: "APPLICATION", applicationId: APP })).toEqual({ scope: "APPLICATION", applicationId: APP, useApplications: true, useKnowledge: true });
    expect(newCareerSetup({ scope: "APPLICATION", applicationId: APP })).toEqual({ scope: "APPLICATION", applicationId: APP, useApplications: true, useKnowledge: true });
  });

  it("names a scope for the list", () => {
    expect(scopeLabel("CAREER")).toBe("Career");
    expect(scopeLabel("APPLICATION")).toBe("Application");
    expect(scopeLabel("GENERAL")).toBeNull();
    expect(scopeLabel(undefined)).toBeNull();
  });
});
