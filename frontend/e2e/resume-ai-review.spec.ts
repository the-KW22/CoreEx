import { expect, test } from "@playwright/test";
import { expectNoViolations, signIn } from "./helpers";

test("reviews Resume wording in Check mode and accepts or rejects suggestions", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/career/library");
  const name = `AI review ${Date.now()}`;
  await page.getByRole("button", { name: "New Resume", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  const panel = page.getByRole("region", { name: "AI writing review" });
  await panel.getByRole("button", { name: "Review with AI" }).click();
  await expect(panel.getByText(/^Suggestion:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /AI writing suggestion/ })).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(page);
  await panel.getByRole("button", { name: "Reject all" }).click();
  await expect(panel.getByText(/^Suggestion:/)).toHaveCount(0);
  await panel.getByRole("button", { name: "Review with AI" }).click();
  await panel.getByRole("button", { name: "Accept all" }).click();
  await expect(panel.getByText(/^Suggestion:/)).toHaveCount(0);
});
