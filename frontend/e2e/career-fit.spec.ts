import { expect, test } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here): the fake model cites the first active
// Fact it is given, scores 72, and always reports one requirement as missing.
test("runs a Fit check, shows its evidence, the estimate and Add evidence, then marks it Out of date", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  const fact = `Built web services ${stamp}`;
  await signIn(page);
  await page.goto("/career/knowledge");
  await page.getByLabel("Fact", { exact: true }).fill(fact);
  await page.getByRole("button", { name: "Add Fact" }).click();
  await expect(page.getByText(fact)).toBeVisible();

  const company = `Fit ${stamp}`;
  await newApplication(page, company, "Engineer");
  await page.getByRole("tab", { name: "Fit" }).click();
  await expect(page.getByText(/^Sends: the posting, your Resume, your Knowledge/)).toBeVisible();
  await page.getByRole("button", { name: "Run Fit check" }).click();
  const panel = page.getByRole("tabpanel", { name: "Fit" });
  await expect(panel.getByText("72", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/an estimate, not a measurement/)).toBeVisible();
  await expect(panel.getByText("Leads a team of ten", { exact: false }).first()).toBeVisible();
  await expect(panel.getByText("A question to ask:")).toBeVisible();
  await expect(panel.getByRole("link", { name: /Add evidence/ }).first()).toBeVisible();
  await expectNoViolations(page);

  // The Library keeps the result, and the List shows the score.
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.getByRole("tabpanel", { name: "Library" }).getByText("72 / 100 (estimate)")).toBeVisible();
  await expectNoViolations(page);
  await page.goto("/career/applications");
  await expect(page.getByRole("link", { name: new RegExp(company) }).getByText("Match about 72 of 100 (estimate)")).toBeVisible();

  // "Add evidence" opens a new Fact for the requirement.
  await page.getByRole("link", { name: new RegExp(company) }).click();
  await page.getByRole("tab", { name: "Fit" }).click();
  await page.getByRole("link", { name: /Add evidence/ }).first().click();
  await expect(page).toHaveURL(/\/career\/knowledge\?for=/);
  await expect(page.getByText(/Adding evidence for:/)).toBeVisible();

  // Changing a cited Fact makes the result Out of date.
  const row = page.getByRole("listitem").filter({ hasText: fact });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Fact text").fill(`${fact} and more`);
  await page.getByRole("listitem").filter({ has: page.getByLabel("Fact text") }).getByRole("button", { name: "Save Fact" }).click();
  await expect(page.getByText(`${fact} and more`)).toBeVisible();
  await page.goto("/career/applications");
  await page.getByRole("link", { name: new RegExp(company) }).click();
  await page.getByRole("tab", { name: "Fit" }).click();
  await expect(page.getByText("Out of date.")).toBeVisible();
  await page.getByRole("button", { name: "Run Fit check again" }).click();
  await expect(page.getByText("Out of date.")).toHaveCount(0, { timeout: 30_000 });
});
