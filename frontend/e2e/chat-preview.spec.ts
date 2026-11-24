import { expect, test, type Page } from "@playwright/test";

import { expectNoViolations, signIn } from "./helpers";

// Run the Chat specs with --workers=1 and the API on COREEX_AI_PROVIDER=fake (E2E_FAKE_AI=1 here). The fake model answers
// "[update] <id> <version> <text>" with a Proposal to replace that Note's text, "[trash] <id>" with one to trash it.
async function startChat(page: Page, text: string) {
  await page.goto("/chat");
  await expect(async () => {
    await page.getByRole("textbox", { name: "Message" }).fill(text);
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await page.getByRole("button", { name: "Send" }).click();
}

// A Note made over MCP with a new Access token, the way Claude Code would; returns its id and version.
async function noteOverMcp(page: Page, title: string, body: string) {
  await page.goto("/settings/tokens");
  await page.getByRole("button", { name: "New Access token" }).click();
  const name = `preview-${Date.now()}`;
  await page.getByRole("dialog", { name: "New Access token" }).getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create token" }).click();
  const secret = await page.getByRole("dialog", { name: "Copy your Access token" }).getByLabel("Access token").inputValue();
  await page.getByRole("button", { name: "Done" }).click();
  const api = process.env.API_URL ?? "http://localhost:8080";
  const response = await page.request.post(`${api}/mcp`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "create_note", arguments: { title, markdown: `# ${title}\n${body}` } },
    },
  });
  expect(response.ok()).toBeTruthy();
  // The account holds at most 10 live Access tokens, so the one made for this call is revoked at once.
  await page.goto("/settings/tokens");
  await page.getByRole("button", { name: `Revoke ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText(`Revoked ${name}`)).toBeVisible();
  return JSON.parse((await response.json()).result.content[0].text) as { id: string; version: number };
}

test("a Proposal for the open Note is drawn on it, typing drops it, and Accept on the page answers the Chat card", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const word = `prev${Date.now()}`;
  await signIn(page);
  const note = await noteOverMcp(page, `Plan ${word}`, "Line one\nLine two");

  // The reply makes a Proposal to replace the text.
  await startChat(page, `[update] ${note.id} ${note.version} # Plan ${word}\nLine one\nAdded by Chat ${word}`);
  await expect(page.getByRole("region", { name: "Proposals" }).getByRole("article")).toBeVisible({ timeout: 30_000 });

  // On the Note, the change is drawn on its text and nothing is changed yet.
  await page.goto(`/notes/${note.id}`);
  const bar = page.getByRole("region", { name: "Proposed change" });
  await expect(bar).toBeVisible();
  await expect(page.locator('[data-proposal="removed"]')).toContainText("Line two");
  await expect(page.locator(".cm-proposal-add")).toContainText(`Added by Chat ${word}`);
  await expectNoViolations(page);

  // Typing wins: the drawing and the bar go.
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" typed");
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".cm-proposal-add")).toHaveCount(0);

  // A fresh Note: Accept on the page applies it, and the Chat card says Applied.
  const second = await noteOverMcp(page, `Second ${word}`, "Old line");
  await startChat(page, `[update] ${second.id} ${second.version} # Second ${word}\nNew line ${word}`);
  await expect(page.getByRole("region", { name: "Proposals" }).getByRole("article")).toBeVisible({ timeout: 30_000 });
  await page.goto(`/notes/${second.id}`);
  await page.getByRole("region", { name: "Proposed change" }).getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("textbox", { name: "Note content" })).toContainText(`New line ${word}`, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Proposed change" })).toHaveCount(0);
  await expect(page.locator(".cm-proposal-new")).toBeVisible();
  await expect(page.locator(".cm-proposal-new")).toHaveCount(0, { timeout: 10_000 });
  await page.goto("/chat");
  await page.getByRole("link", { name: /Second|update/ }).first().click();
  await expect(page.getByRole("region", { name: "Proposals" }).getByText("Applied", { exact: true })).toBeVisible();
});

test("a new Note is previewed from its card, and an organising Proposal shows before and after", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const word = `prev${Date.now()}`;
  await signIn(page);

  await startChat(page, `[propose] Fresh ${word}`);
  const card = page.getByRole("region", { name: "Proposals" }).getByRole("article").filter({ hasText: `Fresh ${word}` });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Preview" }).click();
  const dialog = page.getByRole("dialog", { name: /Preview/ });
  await expect(dialog.getByText("Proposed by the fake model.")).toBeVisible();
  await expectNoViolations(page);
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(card.getByText("Rejected", { exact: true })).toBeVisible({ timeout: 30_000 });

  const note = await noteOverMcp(page, `Gone ${word}`, "x");
  await startChat(page, `[trash] ${note.id}`);
  const trash = page.getByRole("region", { name: "Proposals" }).getByRole("article");
  await expect(trash.getByText("Before:")).toBeVisible({ timeout: 30_000 });
  await expect(trash.getByText("In the Trash")).toBeVisible();
});
