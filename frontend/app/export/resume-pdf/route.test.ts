import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAMPLE } from "@/lib/resume/sample";

import { POST } from "./route";

const SECRET = "a-long-test-secret";

const call = (headers: Record<string, string> = {}, body: unknown = { document: SAMPLE }) =>
  POST(
    new Request("http://localhost/export/resume-pdf", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

describe("the Resume PDF route", () => {
  const before = process.env.EXPORT_PDF_SECRET;

  beforeEach(() => {
    process.env.EXPORT_PDF_SECRET = SECRET;
  });

  afterEach(() => {
    if (before === undefined) delete process.env.EXPORT_PDF_SECRET;
    else process.env.EXPORT_PDF_SECRET = before;
  });

  it("refuses a call with no secret header", async () => {
    expect((await call()).status).toBe(401);
  });

  it("refuses a call with the wrong secret", async () => {
    expect((await call({ "x-export-secret": "not-the-secret" })).status).toBe(401);
  });

  it("refuses every call, even one with a header, when the secret is not set", async () => {
    delete process.env.EXPORT_PDF_SECRET;
    expect((await call({ "x-export-secret": SECRET })).status).toBe(401);
    expect((await call({ "x-export-secret": "" })).status).toBe(401);
  });

  it("refuses a call that sends no document", async () => {
    expect((await call({ "x-export-secret": SECRET }, { photoSrc: null })).status).toBe(400);
  });

  it("draws the Resume as a PDF for the right secret", async () => {
    const response = await call({ "x-export-secret": SECRET });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const head = new TextDecoder().decode((await response.arrayBuffer()).slice(0, 4));
    expect(head).toBe("%PDF");
  }, 30_000);
});
