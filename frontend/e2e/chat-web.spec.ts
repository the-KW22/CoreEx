import { expect, test, type Page } from "@playwright/test";

import { PIXEL, expectNoViolations, signIn } from "./helpers";

// Run the Chat specs with --workers=1 and the API on COREEX_AI_PROVIDER=fake (E2E_FAKE_AI=1 here). The fake model answers
// "[asset] <id>" by reading that Asset, and "[web] ..." with a fixed web source when the Use the web switch was on.
async function send(page: Page, text: string) {
  await page.goto("/chat");
  const box = page.getByRole("textbox", { name: "Message" });
  await expect(async () => {
    await box.fill(text);
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 1000 });
  }).toPass();
  return page.getByRole("button", { name: "Send" });
}

test("Chat reads an uploaded image and shows it as a source", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/items");
  await page.getByRole("button", { name: "Upload", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload files" });
  const name = `chatpixel-${Date.now()}.png`;
  await dialog.getByLabel("Choose files").setInputFiles({ name, mimeType: "image/png", buffer: PIXEL });
  await dialog.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/assets\/([0-9a-f-]{36})/);
  const id = page.url().match(/\/assets\/([0-9a-f-]{36})/)![1];

  const sendButton = await send(page, `[asset] ${id}`);
  await sendButton.click();
  const reply = page.getByRole("article", { name: "Reply" }).last();
  await expect(reply).toContainText("I read the file.", { timeout: 30_000 });
  await expect(reply.getByRole("link", { name: new RegExp(name) })).toHaveAttribute("href", `/assets/${id}`);
});

test("the web is off by default, per message, and its sources are external links", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(120_000);
  await signIn(page);

  // Off: no web tools, so no web source.
  const off = await send(page, "[web] what is new?");
  const web = page.getByRole("checkbox", { name: "Use the web" });
  await expect(web).not.toBeChecked();
  await off.click();
  const first = page.getByRole("article", { name: "Reply" }).last();
  await expect(first).toContainText("This is a fake reply", { timeout: 30_000 });
  await expect(page.getByRole("link", { name: /Fake result/ })).toHaveCount(0);

  // On for one message: the answer cites the page the provider retrieved, as an external link; then it is off again.
  const on = await send(page, "[web] what is new?");
  await web.check();
  await expectNoViolations(page);
  await on.click();
  const reply = page.getByRole("article", { name: "Reply" }).last();
  await expect(reply).toContainText("I searched the web.", { timeout: 30_000 });
  const link = reply.getByRole("link", { name: /Fake result/ });
  await expect(link).toHaveAttribute("href", "https://example.com/fake-result");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toContainText("example.com");
  await expect(web).not.toBeChecked();
});
