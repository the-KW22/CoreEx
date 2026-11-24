import { expect, test } from "@playwright/test";

import { expectNoViolations, signIn } from "./helpers";

// Needs the API on COREEX_AI_PROVIDER=fake and COREEX_AI_KEY_SECRET set (E2E_FAKE_AI=1 here). With the fake provider the key
// "invalid" is refused and any other key is accepted.
test("a User picks a model, saves their own key, chats on it, and removes it", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/settings/ai");
  await expect(page.getByRole("heading", { name: "Chat and AI" })).toBeVisible();
  test.skip(await page.getByText("cannot store keys yet").isVisible(), "Requires COREEX_AI_KEY_SECRET on the API");

  // The model is kept.
  const model = page.getByLabel("Model for your Chats");
  const original = await model.inputValue();
  const other = (await model.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).find((v) => v !== original)!;
  await model.selectOption(other);
  await expect(page.getByText("Saved the model")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Model for your Chats")).toHaveValue(other);
  await page.getByLabel("Model for your Chats").selectOption(original);

  // A key the provider refuses is not stored.
  const field = page.getByLabel("Anthropic API key");
  await field.fill("invalid");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "did not accept" })).toBeVisible();
  await expect(page.getByText("Anthropic key ending in")).toHaveCount(0);

  // A good key shows only its last four characters, and never comes back.
  await field.fill("sk-ant-e2e-secret-WXYZ");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Anthropic key ending in")).toContainText("WXYZ");
  await expect(page.locator("body")).not.toContainText("sk-ant-e2e-secret");
  await expectNoViolations(page);

  // Chat says it is on the User's own key.
  await page.goto("/chat");
  await expect(page.getByText("Using your own key: not counted toward today's budget.")).toBeVisible();

  // Removing the key brings the budget bar back.
  await page.goto("/settings/ai");
  await page.getByRole("button", { name: "Remove key" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByLabel("Anthropic API key")).toBeVisible();
  await page.goto("/chat");
  await expect(page.getByText("Using your own key")).toHaveCount(0);
});
