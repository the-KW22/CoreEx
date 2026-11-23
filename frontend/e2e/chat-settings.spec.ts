import { expect, test, type Page } from "@playwright/test";

import { expectNoViolations, signIn } from "./helpers";

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here). The test account is the owner, so it is an
// Admin. The settings are one row shared by everything, so the test puts them back in a `finally`.
async function saveSettings(page: Page, on: boolean, budget: string) {
  await page.goto("/admin/overview");
  const card = page.getByRole("region", { name: "Chat" });
  await card.getByLabel("Shared key on").setChecked(on);
  await card.getByLabel("Daily budget per User (US dollars)").fill(budget);
  await card.getByRole("button", { name: "Save settings" }).click();
  await expect(card.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
}

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test("an Admin sets the budget and the switch, and Chat shows the usage bar and clear messages", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  await signIn(page);
  try {
    // A budget of 0 refuses the next message, says when it starts again, and offers Search.
    await saveSettings(page, true, "0");
    await expectNoViolations(page);
    await page.goto("/chat");
    await expect(page.getByRole("progressbar", { name: /budget/i })).toBeVisible();
    await send(page, "Hello there");
    const notice = page.getByRole("main").getByRole("alert").filter({ hasText: "midnight UTC" });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("link", { name: "Search your Notes" })).toBeVisible();
    // The text is still in the box, so nothing is lost.
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("Hello there");
    await expectNoViolations(page);

    // Switched off: the same message is refused at once, and the bar says why.
    await saveSettings(page, false, "0.5");
    await page.goto("/chat");
    await expect(page.getByText("Chat is switched off right now.").first()).toBeVisible();
    await send(page, "Hello again");
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "switched off" })).toBeVisible();

    // On again with room: a reply arrives, and the bar still shows.
    await saveSettings(page, true, "0.5");
    await page.goto("/chat");
    await send(page, "One more try");
    await expect(page.getByRole("log", { name: "Conversation" }).getByText("This is a fake reply.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("progressbar", { name: /budget/i })).toBeVisible();
  } finally {
    await saveSettings(page, true, "0.5");
  }
});
