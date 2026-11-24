import { expect, test, type Page } from "@playwright/test";

import { expectNoViolations, newApplication, signIn } from "./helpers";

// Run the Chat specs with --workers=1 and the API on COREEX_AI_PROVIDER=fake (E2E_FAKE_AI=1 here). The fake model answers
// "[fact] <text> | <quote>" with a Proposal for a Fact and "[story] <title>" with one for a Story Note.
async function ask(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message" });
  await expect(async () => {
    await box.fill(text);
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await page.getByRole("button", { name: "Send" }).click();
}

test("a Career chat proposes a Fact from the User's own words, and saves it only when approved", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  await signIn(page);
  const word = `led${Date.now()}`;

  await page.goto("/chat?scope=career");
  await expect(page.getByText("Career chat", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Use my Applications" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Use my Knowledge" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Use my Notes" })).not.toBeChecked();
  await expectNoViolations(page);

  await ask(page, `[fact] I ${word} a team of five | I ${word} a team of five`);
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const card = page.getByRole("region", { name: "Proposals" }).getByRole("article").first();
  await expect(card).toContainText("Add a Fact to Knowledge", { timeout: 30_000 });
  await expect(card).toContainText(word);
  await expectNoViolations(page);

  // Nothing is saved yet.
  await page.goto("/career/knowledge");
  await expect(page.getByText(word)).toHaveCount(0);

  // Approving saves it, with the Chat as its source.
  await page.goBack();
  const again = page.getByRole("region", { name: "Proposals" }).getByRole("article").first();
  await again.getByRole("button", { name: "Approve" }).click();
  await expect(again).toContainText("Applied", { timeout: 30_000 });
  await page.goto("/career/knowledge");
  await expect(page.getByText(`I ${word} a team of five`).first()).toBeVisible();
  await expect(page.getByText("From a Chat").first()).toBeVisible();
});

test("a Fact whose quote the User never wrote is refused, so no Proposal is made", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/chat?scope=career");
  await ask(page, "[fact] I won an award | an award I never mentioned");
  await expect(page.getByRole("article", { name: "Reply" }).last()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Proposals" })).toHaveCount(0);
});

test("an Application chat starts from its Application and says it is about that one", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(120_000);
  await signIn(page);
  await newApplication(page, `Chatco ${Date.now()}`, "Engineer");
  const applicationUrl = page.url();
  await page.getByRole("link", { name: "Chat about this Application" }).click();
  await expect(page).toHaveURL(/\/chat\?scope=application&application=[0-9a-f-]{36}/);
  await expect(page.getByText("About one Application")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Use this Application" })).toBeChecked();
  await expect(page.getByRole("link", { name: "open it" })).toHaveAttribute("href", applicationUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expectNoViolations(page);

  await ask(page, "[knowledge] team");
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByText("About one Application").first()).toBeVisible();
  // The Chat list names the scope.
  await expect(page.getByRole("navigation", { name: "Chats" }).getByText(/Application ·/).first()).toBeVisible();
});
