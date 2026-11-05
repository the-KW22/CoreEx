import { deepStrictEqual as assertEquals } from "node:assert"; // built in: no download
import { handle, MAX_BATCH, MAX_TEXT_CHARS } from "./handler.ts";

const SECRET = "test-secret";

// Records what it was asked, and answers a vector that shows which text it was for.
function fakeModel() {
  const seen: string[] = [];
  return { seen, embed: (text: string) => (seen.push(text), Promise.resolve([text.length, 0.5])) };
}

const call = (body: unknown, headers: Record<string, string> = { "x-embed-secret": SECRET }, method = "POST") =>
  new Request("http://localhost/embed", {
    method,
    headers,
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });

Deno.test("refuses a missing, wrong or empty secret before the model runs", async () => {
  const wrong: Record<string, string>[] = [{}, { "x-embed-secret": "wrong" }, { "x-embed-secret": "" }];
  for (const headers of wrong) {
    const model = fakeModel();
    const response = await handle(call({ texts: ["a"] }, headers), SECRET, model.embed);
    assertEquals(response.status, 401);
    assertEquals(model.seen, []);
  }
});

Deno.test("refuses everyone when the server has no secret", async () => {
  const model = fakeModel();
  assertEquals((await handle(call({ texts: ["a"] }, {}), "", model.embed)).status, 401);
  assertEquals(model.seen, []);
});

Deno.test("answers one vector per text, in order", async () => {
  const model = fakeModel();
  const response = await handle(call({ texts: ["a", "bbb", "cc"] }), SECRET, model.embed);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { vectors: [[1, 0.5], [3, 0.5], [2, 0.5]] });
  assertEquals(model.seen, ["a", "bbb", "cc"]);
});

Deno.test("rejects input it cannot embed", async () => {
  const bad = [
    "not json",
    {},
    { texts: "a" },
    { texts: [] },
    { texts: [1] },
    { texts: [""] },
    { texts: Array(MAX_BATCH + 1).fill("a") },
  ];
  for (const body of bad) {
    const model = fakeModel();
    assertEquals((await handle(call(body), SECRET, model.embed)).status, 400, JSON.stringify(body));
    assertEquals(model.seen, []);
  }
});

Deno.test("cuts a text over the cap instead of refusing the batch", async () => {
  const model = fakeModel();
  const response = await handle(call({ texts: ["x".repeat(MAX_TEXT_CHARS + 500), "ok"] }), SECRET, model.embed);
  assertEquals(response.status, 200);
  assertEquals(model.seen.map((t) => t.length), [MAX_TEXT_CHARS, 2]);
});

Deno.test("accepts a full batch of the longest text", async () => {
  const response = await handle(call({ texts: Array(MAX_BATCH).fill("x".repeat(MAX_TEXT_CHARS)) }), SECRET, fakeModel().embed);
  assertEquals(response.status, 200);
});

Deno.test("only POST is allowed, after the secret check", async () => {
  assertEquals((await handle(call(null, { "x-embed-secret": SECRET }, "GET"), SECRET, fakeModel().embed)).status, 405);
  assertEquals((await handle(call(null, {}, "GET"), SECRET, fakeModel().embed)).status, 401);
});

Deno.test("a model failure is a plain 500 that does not leak the text", async () => {
  const response = await handle(call({ texts: ["secret note text"] }), SECRET, () => Promise.reject(new Error("secret note text")));
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { code: "EMBED_FAILED" });
});
