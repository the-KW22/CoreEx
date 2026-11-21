import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("reviews and accepts or rejects an improved Resume field", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  await signIn(page);
  await page.goto("/career/library");
  const name = `AI improvement ${Date.now()}`;
  await page.getByRole("button", { name: "New Resume", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name, exact: true }).click();
  const summary = page.locator('[data-field="summary"]');
  const original = await summary.getByRole("textbox", { name: "Summary" }).innerText();
  await summary.getByRole("button", { name: "Improve with AI" }).click();
  await expect(summary.getByText(/^Suggestion:/)).toBeVisible();
  await summary.getByRole("button", { name: "Reject" }).click();
  await expect(summary.getByRole("textbox", { name: "Summary" })).toHaveText(original);
  await summary.getByRole("button", { name: "Improve with AI" }).click();
  await summary.getByRole("button", { name: "Accept" }).click();
  await expect(summary.getByText(/^Suggestion:/)).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("heading", { name: /History/ })).toBeVisible();
});
