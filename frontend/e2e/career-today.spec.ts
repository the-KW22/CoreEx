import { expect, test, type Page } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

// A time in the browser's own zone, as the datetime-local field takes it.
const localInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const shownAs = (d: Date) => d.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

// Adds an interview in the Details tab of the Application open on the page.
async function addInterview(page: Page, when: Date) {
  const details = page.getByRole("tabpanel", { name: "Details" });
  await details.getByRole("button", { name: "Add interview" }).click();
  await details.getByLabel("Interview time").fill(localInput(when));
  await details.getByRole("button", { name: "Save interview" }).click();
  await expect(details.getByText(shownAs(when)).first()).toBeVisible();
}

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here) for the AI actions; the Today list itself
// needs no AI. The fake Interview prep plans "Pick two stories" and offers three practice questions.
test("lists an interview within a day under Needs you with its AI actions, and a later one under Coming up without them", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const company = `Today ${stamp}`;
  await signIn(page);
  await newApplication(page, company, "Engineer");
  await addInterview(page, inHours(2));
  await addInterview(page, inDays(5));

  await page.goto("/career");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  const needs = page.getByRole("region", { name: "Needs you" });
  const coming = page.getByRole("region", { name: "Coming up" });

  const soon = needs.getByRole("listitem").filter({ hasText: company });
  await expect(soon.getByRole("link", { name: company })).toHaveAttribute("href", /\/career\/applications\//);
  await expect(soon.getByRole("button", { name: "Generate briefing now" })).toBeVisible();
  await expect(soon.getByRole("button", { name: "Practice 3 questions" })).toBeVisible();
  await expect(soon.getByText(/^Sends: the posting, your Resume, your Knowledge, your Stories, the interview/)).toBeVisible();

  const later = coming.getByRole("listitem").filter({ hasText: company });
  await expect(later.getByRole("link", { name: company })).toBeVisible();
  await expect(later.getByRole("button", { name: "Generate briefing now" })).toHaveCount(0);
  await expect(later.getByRole("button", { name: "Practice 3 questions" })).toHaveCount(0);
  await expectNoViolations(page);
});

test("generates the briefing from Today and opens it", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  const company = `Briefing ${stamp}`;
  await signIn(page);
  await newApplication(page, company, "Engineer");
  await addInterview(page, inHours(2));

  await page.goto("/career");
  const soon = page.getByRole("region", { name: "Needs you" }).getByRole("listitem").filter({ hasText: company });
  await soon.getByRole("button", { name: "Generate briefing now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Briefing ready." })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Open briefing" }).click();

  await expect(page).toHaveURL(/tab=Interview(%20|-| )prep/);
  const prep = page.getByRole("tabpanel", { name: "Interview prep" });
  await expect(prep.getByText("Pick two stories", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(page);
});

test("practice 3 questions opens the Practice tab with the three questions to choose from", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  const company = `Drill ${stamp}`;
  await signIn(page);
  await newApplication(page, company, "Engineer");
  await addInterview(page, inHours(2));

  // No Interview prep exists yet: Practice makes one first.
  await page.goto("/career");
  const soon = page.getByRole("region", { name: "Needs you" }).getByRole("listitem").filter({ hasText: company });
  await soon.getByRole("button", { name: "Practice 3 questions" }).click();

  await expect(page).toHaveURL(/tab=Practice/, { timeout: 60_000 });
  const practice = page.getByRole("tabpanel", { name: "Practice" });
  const offered = practice.getByRole("group", { name: "Suggested questions" });
  await expect(offered.getByRole("button")).toHaveCount(3);
  await offered.getByRole("button").first().click();
  await expect(practice.getByLabel("Practice question", { exact: true })).not.toHaveValue("");
  await expectNoViolations(page);
});
