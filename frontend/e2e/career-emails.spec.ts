import { expect, test, type Page } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

// Adds an interview in the Details tab of the Application open on the page.
async function addInterview(page: Page, when: string, shown: string) {
  const details = page.getByRole("tabpanel", { name: "Details" });
  await details.getByRole("button", { name: "Add interview" }).click();
  await details.getByLabel("Interview time").fill(when);
  await details.getByRole("button", { name: "Save interview" }).click();
  await expect(details.getByText(shown).first()).toBeVisible();
}

// Marks the Application open on the page as applied, with a Resume linked for Mark as applied to need.
async function markApplied(page: Page, name: string) {
  const applicationUrl = page.url();
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.goto(applicationUrl);
  await page.getByRole("tab", { name: "Details" }).click();
  await page.getByRole("combobox", { name: /^Resume/ }).selectOption({ label: name });
  await page.getByRole("button", { name: "Save Resume link" }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Details" }).click();
  await page.getByRole("tabpanel", { name: "Details" }).getByRole("button", { name: "Mark as applied" }).click();
  await expect(page.getByRole("tabpanel", { name: "Details" }).getByText(/^Marked as applied on/)).toBeVisible({ timeout: 15_000 });
}

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here): the fake email has a fixed subject and body,
// and attaches the documents linked to the Application.
test("drafts an application email, saves an edit, and copies it or opens it in the mail app", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: test.info().project.use.baseURL! });
  const stamp = Date.now();
  await signIn(page);
  await newApplication(page, `Emails ${stamp}`, "Engineer");
  const applicationUrl = page.url();

  await page.getByRole("tab", { name: "Emails" }).click();
  const emails = page.getByRole("tabpanel", { name: "Emails" });
  await expect(emails.getByText(/^Sends: /).first()).toBeVisible();
  await emails.getByRole("button", { name: "Draft application email" }).click();
  await expect(emails.getByRole("heading", { name: "Application email", level: 3 })).toBeVisible({ timeout: 60_000 });
  await expect(emails.getByText("CoreEx never sends them", { exact: false })).toBeVisible();
  await expectNoViolations(page);

  // An edit to the subject is saved, and comes back after a reload.
  const edited = `Edited subject ${stamp}`;
  await emails.getByLabel("Subject", { exact: true }).fill(edited);
  await emails.getByRole("button", { name: "Save edit" }).click();
  await expect(emails.getByRole("button", { name: "Save edit" })).toBeDisabled();
  await page.goto(applicationUrl);
  await page.getByRole("tab", { name: "Emails" }).click();
  await expect(emails.getByLabel("Subject", { exact: true })).toHaveValue(edited);

  // The mail link carries the edited subject.
  const href = await emails.getByRole("link", { name: "Open in mail app" }).getAttribute("href");
  expect(href).toMatch(/^mailto:\?subject=/);
  expect(new URL(href!).searchParams.get("subject")).toBe(edited);

  // Copy puts the subject and body on the clipboard, and says so.
  await emails.getByRole("button", { name: "Copy" }).click();
  await expect(emails.getByText("Copied", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // Windows turns the newlines of copied text into CRLF.
  expect(copied.replace(/\r\n/g, "\n").startsWith(`${edited}\n\n`)).toBe(true);
  await expectNoViolations(page);
});

test("offers a follow-up only once the Application is marked applied", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  await signIn(page);
  await newApplication(page, `Follow ${stamp}`, "Engineer");

  await page.getByRole("tab", { name: "Emails" }).click();
  const emails = page.getByRole("tabpanel", { name: "Emails" });
  await expect(emails.getByRole("button", { name: "Draft follow-up" })).toBeDisabled();
  await expect(emails.getByText("Mark this Application as applied first.")).toBeVisible();

  await markApplied(page, `Follow CV ${stamp}`);
  await page.getByRole("tab", { name: "Emails" }).click();
  await emails.getByRole("button", { name: "Draft follow-up" }).click();
  await expect(emails.getByRole("heading", { name: "Follow-up", level: 3 })).toBeVisible({ timeout: 60_000 });
  await expectNoViolations(page);
});

test("says a thank-you waits for a Debrief on the interview", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  await signIn(page);
  await newApplication(page, `Thanks ${stamp}`, "Engineer");
  await addInterview(page, "2020-03-05T17:30", "Mar 5, 2020, 5:30 PM");

  // Without a Debrief the thank-you is disabled, and says why.
  await page.getByRole("tab", { name: "Emails" }).click();
  const emails = page.getByRole("tabpanel", { name: "Emails" });
  await expect(emails.getByText("Write a Debrief for an interview first, then draft the thank-you.")).toBeVisible();
  await expect(emails.getByRole("button", { name: "Draft thank-you" })).toBeDisabled();
  // Drafting the thank-you after a Debrief needs the Debrief tab (hidden, #366), so that step is not covered here.
  await expectNoViolations(page);
});
