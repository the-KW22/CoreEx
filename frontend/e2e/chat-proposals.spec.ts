import { expect, test, type Page } from "@playwright/test";

import { expectNoViolations, signIn } from "./helpers";

// The settings spec changes the Shared key for everyone, so run the Chat specs with --workers=1.
// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here). The fake model answers "[propose] Title" with
// a Proposal to create a Note called Title, and "[ask]" with a question card (Work or Home).
async function startChat(page: Page, text: string) {
  await page.goto("/chat");
  // A message typed before the page has hydrated is wiped by it, so fill again until Send is ready.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Message" }).fill(text);
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await page.getByRole("button", { name: "Send" }).click();
}

test("a Proposal waits for approval, shows its text, takes the User's edit, and can be rejected by key", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const word = `prop${Date.now()}`;
  await signIn(page);

  // The reply makes a Proposal; nothing is created yet.
  await startChat(page, `[propose] Plan ${word}`);
  const proposals = page.getByRole("region", { name: "Proposals" });
  const card = proposals.getByRole("article").filter({ hasText: `Create the Note “Plan ${word}”` });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("Pending", { exact: true })).toBeVisible();
  await expect(card.getByText("Proposed by the fake model.")).toBeVisible();
  await expectNoViolations(page);

  // The User's own text is what is saved.
  await card.getByRole("button", { name: "Edit text" }).click();
  await card.getByLabel(/Your text for/).fill(`# Plan ${word}\nIn my own words ${word}.`);
  await expect(card.getByText("Your edit will be saved.")).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByText("Applied", { exact: true })).toBeVisible({ timeout: 30_000 });
  await card.getByRole("link", { name: `Open Plan ${word}` }).click();
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole("textbox", { name: "Note content" })).toContainText(`In my own words ${word}.`);

  // R rejects the focused Proposal: the Note is not made.
  await startChat(page, `[propose] Skip ${word}`);
  const second = page.getByRole("region", { name: "Proposals" }).getByRole("article").filter({ hasText: `Skip ${word}` });
  await expect(second).toBeVisible({ timeout: 30_000 });
  await second.focus();
  await page.keyboard.press("r");
  await expect(second.getByText("Rejected", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.goto(`/search?q=Skip+${word}`);
  await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`Skip ${word}`) })).toHaveCount(0);
});

test("a question card asks, and the answer continues the same reply", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  await signIn(page);

  await startChat(page, "[ask] Where should this go?");
  const question = page.getByRole("region", { name: "Question from Chat" });
  await expect(question.getByText("Which Folder should it go in?")).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(page);
  await question.getByRole("button", { name: "Work" }).click();
  await expect(page.getByRole("log", { name: "Conversation" }).getByText("Going with: Work")).toBeVisible({ timeout: 30_000 });
  await expect(question).toHaveCount(0);
});
