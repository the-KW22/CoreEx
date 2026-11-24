import { describe, expect, it } from "vitest";

import type { components } from "@/lib/api/schema";

import { type Proposal, groupByMessage, keyAction, pendingBatch, pendingQuestion } from "./proposals";

type ChatMessage = components["schemas"]["MessageView"];

const proposal = (over: Partial<Proposal>): Proposal =>
  ({ id: "p", batchId: "b1", messageId: "m1", tool: "t", label: "L", status: "PENDING", details: {}, link: null, createdAt: "", ...over }) as Proposal;

const message = (role: "USER" | "ASSISTANT", blocks: unknown[]): ChatMessage =>
  ({ id: "x", role, blocks, status: "COMPLETE", sources: [], createdAt: "" }) as unknown as ChatMessage;

const askBlock = (input: unknown, id = "tu1") => ({ type: "tool_use", name: "ask_user_question", id, input });

describe("groupByMessage", () => {
  it("groups by message and keeps the order inside each group", () => {
    const groups = groupByMessage([proposal({ id: "p1", messageId: "m1" }), proposal({ id: "p2", messageId: "m2" }), proposal({ id: "p3", messageId: "m1" })]);
    expect([...groups.keys()]).toEqual(["m1", "m2"]);
    expect(groups.get("m1")?.map((p) => p.id)).toEqual(["p1", "p3"]);
  });
});

describe("pendingBatch", () => {
  it("returns only the pending Proposals of that batch", () => {
    const list = [
      proposal({ id: "a", batchId: "b1" }),
      proposal({ id: "b", batchId: "b1", status: "APPLIED" }),
      proposal({ id: "c", batchId: "b2" }),
    ];
    expect(pendingBatch(list, "b1").map((p) => p.id)).toEqual(["a"]);
  });
});

describe("pendingQuestion", () => {
  it("returns the question when the last message asks one", () => {
    const q = pendingQuestion([message("USER", [{ type: "text", text: "hi" }]), message("ASSISTANT", [askBlock({ question: " Which? ", choices: ["A", "B"] })])]);
    expect(q).toEqual({ toolUseId: "tu1", question: "Which?", choices: ["A", "B"] });
  });

  it("drops empty choices and keeps at most five", () => {
    const q = pendingQuestion([message("ASSISTANT", [askBlock({ question: "Q", choices: ["", " a ", "b", "c", "d", "e", "f"] })])]);
    expect(q?.choices).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("allows zero choices", () => {
    expect(pendingQuestion([message("ASSISTANT", [askBlock({ question: "Q", choices: [] })])])?.choices).toEqual([]);
  });

  it("returns null when the last message is not the assistant's", () => {
    expect(pendingQuestion([message("ASSISTANT", [askBlock({ question: "Q", choices: [] })]), message("USER", [{ type: "text", text: "x" }])])).toBeNull();
  });

  it("returns null when the question is not in the last message", () => {
    expect(pendingQuestion([message("ASSISTANT", [askBlock({ question: "Q", choices: [] })]), message("ASSISTANT", [{ type: "text", text: "done" }])])).toBeNull();
  });

  it("returns null for text that only mentions the tool", () => {
    expect(pendingQuestion([message("ASSISTANT", [{ type: "text", text: "I could use ask_user_question here." }])])).toBeNull();
  });

  it("returns null for an empty question, a missing id or choices that are not a list", () => {
    expect(pendingQuestion([message("ASSISTANT", [askBlock({ question: "  ", choices: [] })])])).toBeNull();
    expect(pendingQuestion([message("ASSISTANT", [askBlock({ question: "Q", choices: [] }, "")])])).toBeNull();
    expect(pendingQuestion([message("ASSISTANT", [askBlock({ question: "Q", choices: "A" })])])).toBeNull();
  });
});

describe("keyAction", () => {
  it("maps A and R, either case, to approve and reject", () => {
    expect(keyAction("a", "article")).toBe("approve");
    expect(keyAction("A", "article")).toBe("approve");
    expect(keyAction("r", "article")).toBe("reject");
    expect(keyAction("R", "article")).toBe("reject");
  });

  it("maps the arrows to next and previous", () => {
    expect(keyAction("ArrowDown", "article")).toBe("next");
    expect(keyAction("ArrowUp", "article")).toBe("previous");
  });

  it("ignores other keys", () => {
    expect(keyAction("x", "article")).toBeNull();
    expect(keyAction("Enter", "button")).toBeNull();
  });

  it("ignores keys typed into a field", () => {
    expect(keyAction("a", "input")).toBeNull();
    expect(keyAction("r", "textarea")).toBeNull();
    expect(keyAction("ArrowDown", "textarea")).toBeNull();
  });
});
