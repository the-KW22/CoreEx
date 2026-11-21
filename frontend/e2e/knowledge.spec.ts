import { expect, test } from "@playwright/test";
import { expectNoViolations, signIn } from "./helpers";

test("adds, corrects, switches off and forgets a Fact by hand", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const first = `Built billing ${stamp}`;
  const corrected = `Built the billing service ${stamp}`;
  await signIn(page);
  await page.goto("/career/knowledge");
  await page.getByLabel("Fact", { exact: true }).fill(first);
  await page.getByRole("button", { name: "Add Fact" }).click();
  await expect(page.getByText(first)).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: first });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Fact text").fill(corrected);
  // While editing, the Fact's old words are in the box, not in the row's text, so find the row by its box.
  await page.getByRole("listitem").filter({ has: page.getByLabel("Fact text") }).getByRole("button", { name: "Save Fact" }).click();
  await expect(page.getByText(corrected)).toBeVisible();
  await expect(page.getByText(`Earlier wording: ${first}`)).toBeVisible();

  const kept = page.getByRole("listitem").filter({ hasText: corrected });
  await kept.getByRole("button", { name: "Switch off for AI" }).click();
  await expect(page.getByText("Switched off: never sent to AI")).toBeVisible();

  await kept.getByRole("button", { name: "Forget", exact: true }).click();
  await kept.getByRole("button", { name: "Forget for good" }).click();
  await expect(page.getByText(corrected)).toHaveCount(0);
  await expectNoViolations(page);
});

test("pulls a Fact from a Resume line with its quote, and it is not suggested again once forgotten", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const resume = `Knowledge source ${stamp}`;
  await signIn(page);
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume", exact: true }).click();
  const cv = page.getByRole("dialog", { name: "New Resume" });
  await cv.getByLabel("Name").fill(resume);
  await cv.getByLabel("Start with sample content").check();
  await cv.getByRole("button", { name: "Create Resume" }).click();
  await expect(cv).toHaveCount(0);

  await page.goto("/career/knowledge");
  await page.getByText("Pull Facts from a Resume or Note").click();
  await page.getByRole("combobox", { name: "Resume", exact: true }).selectOption({ label: resume });
  await page.getByRole("button", { name: "Show lines" }).click();
  const candidate = page.locator("form").filter({ hasText: "From the source:" }).first();
  await expect(candidate).toBeVisible();
  const quote = (await candidate.locator("q").textContent()) ?? "";
  expect(quote.length).toBeGreaterThan(0);
  await candidate.getByRole("button", { name: "Add as Fact" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `From your Resume` }).first()).toBeVisible();
  await expectNoViolations(page);
});

test("starts a Story with its five headings, and removes its Story kind", async ({ page }) => {
  test.setTimeout(120_000);
  const name = `Outage story ${Date.now()}`;
  await signIn(page);
  await page.goto("/career/knowledge");
  await page.getByLabel("Story name").fill(name);
  await page.getByRole("button", { name: "New Story" }).click();
  const story = page.getByRole("listitem").filter({ hasText: name });
  await expect(story).toBeVisible();
  await story.getByRole("button", { name: "Remove Story kind" }).click();
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expectNoViolations(page);
});

test("marks an existing Note as a Story from the Note, and clears it", async ({ page }) => {
  test.setTimeout(120_000);
  const name = `Plain note ${Date.now()}`;
  await signIn(page);
  await page.goto("/career/knowledge");
  await page.getByLabel("Story name").fill(name);
  await page.getByRole("button", { name: "New Story" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  const toggle = page.getByLabel("This Note is a Story");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.goto("/career/knowledge");
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expectNoViolations(page);
});

test("saves Preferences and reloads them, and refuses a minimum pay without a currency", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/career/knowledge");
  const prefs = page.getByRole("group", { name: "Places" });
  await page.getByLabel("Target roles").fill("Backend engineer");
  await prefs.getByLabel("Remote").check();
  await page.getByLabel("Minimum base pay").fill("60000");
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page.getByText("A minimum pay needs a currency and a pay period.")).toBeVisible();

  await page.getByLabel("Currency").selectOption("GBP");
  await page.getByLabel("Pay period").selectOption("YEAR");
  await page.getByLabel("Notice period").fill("1 month");
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Target roles")).toHaveValue("Backend engineer");
  await expect(page.getByLabel("Minimum base pay")).toHaveValue("60000");
  await expect(page.getByLabel("Currency")).toHaveValue("GBP");
  await expectNoViolations(page);
});
