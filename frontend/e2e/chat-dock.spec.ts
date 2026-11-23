import { expect, test } from "@playwright/test";

import { expectNoViolations, newNote, signIn } from "./helpers";

// Run the Chat specs with --workers=1 and the API on COREEX_AI_PROVIDER=fake (E2E_FAKE_AI=1 here). The fake model answers
// "[where]" by saying back the page, selection and trail it was told about.
test("the Chat button opens a panel that knows the open Note, the selection and the trail, and hands messages over", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const word = `dock${Date.now()}`;
  await signIn(page);
  await newNote(page, `Plan ${word}`);

  // The button is on a Note page; Ctrl+J opens the panel with the cursor in the message box.
  const button = page.getByRole("button", { name: "Open Chat" });
  await expect(button).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Note content" });
  await editor.click();
  await page.keyboard.type(`Chosen words ${word}`);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+j");
  const panel = page.getByRole("dialog", { name: "Chat" });
  const message = panel.getByRole("textbox", { name: "Message" });
  await expect(message).toBeFocused({ timeout: 30_000 });
  await expectNoViolations(page);

  // What the model is told: the open Note, the selected text and the trail.
  await message.fill("[where]");
  await panel.getByRole("button", { name: "Send" }).click();
  const reply = panel.getByRole("article", { name: "Reply" }).last();
  await expect(reply).toContainText(`Plan ${word}`, { timeout: 30_000 });
  await expect(reply).toContainText(`Chosen words ${word}`);
  await expect(reply).toContainText("CREATED");
  await expect(reply).toContainText("EDITED");

  // Escape closes the panel and gives focus back to the button.
  await message.click();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Chat" })).toBeFocused();

  // A hand-off opens a new Chat with a message the User still sends.
  await page.getByRole("button", { name: "Ask Chat about this Note" }).click();
  await expect(panel.getByRole("textbox", { name: "Message" })).toHaveValue(new RegExp(`^About my Note "Plan ${word}.*": $`));
  await page.goto("/search?q=hello");
  await page.getByRole("button", { name: "Ask Chat" }).click();
  await expect(panel.getByRole("textbox", { name: "Message" })).toHaveValue(/Search my Notes for "hello"/);

  // Expand opens the same Chat on its own page, where the button is not shown.
  await panel.getByRole("link", { name: "Expand to the Chat page" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole("button", { name: "Open Chat" })).toHaveCount(0);
});

test("on a phone the panel fills the screen", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.getByRole("button", { name: "Open Chat" }).click();
  const box = await page.getByRole("dialog", { name: "Chat" }).boundingBox();
  expect(box?.width).toBe(375);
  expect(box?.height).toBe(812);
});
