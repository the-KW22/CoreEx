import { expect, test } from "@playwright/test";

import { expectNoViolations, expectSaved, newNote, signIn } from "./helpers";

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here). The fake model answers "This is a fake
// reply."; "[search] words" makes it run the search tool first and answer from what it found; "[slow]" makes it write one
// word every quarter of a second, so there is something to Stop.
test("chats: a reply with a source, Stop, Save as Note and Delete Chat", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  const word = `chatword${stamp}`;
  const title = `Chat source ${word}`;

  await signIn(page);
  await newNote(page, title);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`A line about ${word}.`);
  await expectSaved(page);

  // The rail opens the Chat module; a new Chat shows the privacy note and the Use my Notes switch.
  // (A Note page shows the Knowledge Base panel in place of the modules, so start from Home.)
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByText(/are sent to Anthropic/)).toBeVisible();
  await expect(page.getByLabel("Use my Notes")).toBeChecked();

  // Stop works on the very first reply of a new Chat: it keeps what was written and marks it Stopped.
  const box = page.getByRole("textbox", { name: "Message" });
  const log = page.getByRole("log", { name: "Conversation" });
  await box.fill(`[slow] ${word}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log.getByText(/word0/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(log.getByText("Stopped", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(log.getByText(/word0/)).toBeVisible();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  const chatUrl = page.url();

  // A reply that read the Note shows it as a source; the Chat is saved and listed.
  await box.fill(`[search] ${word}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log.getByText("This is a fake reply from your Notes.")).toBeVisible({ timeout: 30_000 });
  await expect(log.getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Chats" }).getByRole("link", { name: new RegExp(word) })).toBeVisible();
  await expectNoViolations(page);

  // Save as Note makes a Note of the first (stopped) reply and opens it.
  await log.getByRole("button", { name: "Save as Note" }).first().click();
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole("textbox", { name: "Note content" })).toContainText("word0");

  // Delete Chat asks first, and the Chat is gone from the list afterwards.
  await page.goto(chatUrl);
  await page.getByRole("button", { name: "Delete Chat" }).click();
  await expectNoViolations(page);
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete Chat" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("navigation", { name: "Chats" }).getByRole("link", { name: new RegExp(word) })).toHaveCount(0);
  await page.goto(chatUrl);
  await expect(page.getByText("It may have moved or been deleted.")).toBeVisible();
});
