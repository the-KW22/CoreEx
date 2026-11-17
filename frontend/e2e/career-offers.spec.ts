import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

// The Application title is "<role> at <company>", as its page heading shows.
const titleOf = (company: string) => `Engineer at ${company}`;

// The value of one term in an Offer row or a version: the dd beside its dt.
const termValue = (scope: Locator, label: string) =>
  scope.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd");

// Adds an Offer to a new Application through the Add Offer panel on the Offers page.
async function addOffer(page: Page, company: string, fields: { basePay: string; currency: string; period: string }) {
  await newApplication(page, company, "Engineer");
  await page.goto("/career/offers");
  await page.getByRole("button", { name: "Add Offer", exact: true }).click();
  const select = page.getByLabel("Application", { exact: true });
  await select.selectOption({ value: (await select.locator("option", { hasText: company }).getAttribute("value")) ?? "" });
  const form = page.getByRole("form", { name: "New Offer" });
  await form.getByLabel("Base pay", { exact: true }).fill(fields.basePay);
  await form.getByLabel("Currency", { exact: true }).fill(fields.currency);
  await form.getByLabel("Pay period", { exact: true }).selectOption({ label: fields.period });
  await form.getByRole("button", { name: "Save Offer" }).click();
  await expect(page.getByRole("list").filter({ has: page.getByRole("link", { name: titleOf(company) }) })).toBeVisible();
}

test("adds an Offer with only pay, edits it, and reads its earlier versions", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const company = `Offer ${stamp}`;
  await signIn(page);
  await addOffer(page, company, { basePay: "90000", currency: "USD", period: "Per year" });

  // Reloaded: the terms the User did not fill in still read Not set.
  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: titleOf(company) });
  await expect(termValue(row, "Base pay")).toHaveText("90,000");
  await expect(termValue(row, "Currency")).toHaveText("USD");
  await expect(termValue(row, "Pay period")).toHaveText("Per year");
  await expect(termValue(row, "Bonus")).toHaveText("Not set");
  await expect(termValue(row, "Start date")).toHaveText("Not set");
  await expect(termValue(row, "Office days per week")).toHaveText("Not set");

  // Edit: add a bonus. The form shows the saved values after the save.
  await row.getByRole("button", { name: /^Edit / }).click();
  const form = row.getByRole("form");
  await form.getByLabel("Bonus", { exact: true }).fill("Signing bonus 5000");
  await form.getByRole("button", { name: "Save Offer" }).click();
  await expect(form.getByRole("status").filter({ hasText: "Offer saved." })).toBeVisible();
  await expect(form.getByLabel("Bonus", { exact: true })).toHaveValue("Signing bonus 5000");
  await expect(form.getByLabel("Start date", { exact: true })).toHaveValue("");

  // The terms before the edit are an earlier version.
  const earlier = row.getByRole("button", { name: /^Earlier versions of / });
  await expect(earlier).toHaveAttribute("aria-expanded", "false");
  await earlier.click();
  await expect(earlier).toHaveAttribute("aria-expanded", "true");
  const versions = row.getByRole("list", { name: "Earlier versions" });
  await expect(versions.getByText("Version 1", { exact: false })).toBeVisible();
  await expect(termValue(versions, "Base pay").first()).toHaveText("90,000");
  await expect(termValue(versions, "Bonus").first()).toHaveText("Not set");
  await expectNoViolations(page);
});

test("flags an Offer below the minimum pay in Preferences", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const company = `Floor ${stamp}`;
  await signIn(page);

  await page.goto("/career/knowledge");
  const prefs = page.getByRole("region", { name: "Preferences" });
  await prefs.getByLabel("Minimum base pay", { exact: true }).fill("100000");
  // The selects sit inside their labels, so their names include every option: match the label text instead.
  await prefs.locator("label", { hasText: /^Currency/ }).locator("select").selectOption("USD");
  await prefs.locator("label", { hasText: /^Pay period/ }).locator("select").selectOption({ label: "Per year" });
  await prefs.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();

  await addOffer(page, company, { basePay: "90000", currency: "USD", period: "Per year" });
  const row = page.getByRole("listitem").filter({ hasText: titleOf(company) });
  await expect(row.getByText("Below your minimum pay", { exact: true })).toBeVisible();
  await expectNoViolations(page);
});

test("compares two Offers: refuses different currencies, and shows the same-currency pair side by side", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const usd = `CmpUsd ${stamp}`;
  const eur = `CmpEur ${stamp}`;
  await signIn(page);
  await addOffer(page, usd, { basePay: "90000", currency: "USD", period: "Per year" });
  await addOffer(page, eur, { basePay: "80000", currency: "EUR", period: "Per year" });

  await page.goto("/career/offers");
  const compare = page.getByRole("button", { name: "Compare", exact: true });
  await page.getByRole("checkbox", { name: titleOf(usd) }).check();
  await page.getByRole("checkbox", { name: titleOf(eur) }).check();
  await compare.click();
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /convert/i })).toBeVisible();
  await expectNoViolations(page);

  // Two Offers in USD per year compare side by side.
  const first = `CmpFirst ${stamp}`;
  const second = `CmpSecond ${stamp}`;
  await addOffer(page, first, { basePay: "95000", currency: "USD", period: "Per year" });
  await addOffer(page, second, { basePay: "85000", currency: "USD", period: "Per year" });
  await page.goto("/career/offers");
  await page.getByRole("checkbox", { name: titleOf(first) }).check();
  await page.getByRole("checkbox", { name: titleOf(second) }).check();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: titleOf(first) })).toBeVisible();
  await expect(table.getByRole("row", { name: /Base pay/ }).getByRole("cell").first()).toHaveText("95,000");
  await expect(table.getByRole("row", { name: /Base pay/ }).getByRole("cell").last()).toHaveText("85,000");
  await expectNoViolations(page);
});
