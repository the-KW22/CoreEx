import { expect, test } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here): the fake reply has fixed asks, unconfirmed
// points, subject and body, and proposes no changes, so Apply and Undo are left to the API tests.
const employerEmail = [
  "Thanks for applying. Could you share your availability for a call next week?",
  "",
  "Best,",
  "Sam",
  "",
  "On Mon, 3 Nov 2026 at 10:00, Alex <alex@example.com> wrote:",
  "> Thank you for applying to the Engineer role.",
  "> earlier text from the thread",
].join("\n");

// The Messages tab is hidden (#366); add it back to SHOWN in workspace.tsx and remove .skip.
test.skip("reads an employer's email, edits and saves the reply, and opens it in the mail app", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: test.info().project.use.baseURL! });
  const stamp = Date.now();
  await signIn(page);
  await newApplication(page, `Messages ${stamp}`, "Engineer");
  const applicationUrl = page.url();

  await page.getByRole("tab", { name: "Messages" }).click();
  const messages = page.getByRole("tabpanel", { name: "Messages" });
  await expect(messages.getByText("CoreEx never reads your mailbox", { exact: false })).toBeVisible();
  await expect(messages.getByText(/^Sends: /).first()).toBeVisible();

  await messages.getByLabel("Employer's email", { exact: true }).fill(employerEmail);
  await messages.getByRole("button", { name: "Read this email" }).click();
  await expect(messages.getByRole("heading", { name: /^Reply to the employer/, level: 3 })).toBeVisible({ timeout: 60_000 });
  await expect(messages.getByText("Can you share your availability?", { exact: true })).toBeVisible();
  await expect(messages.getByText("The start date", { exact: true })).toBeVisible();
  await expectNoViolations(page);

  // The quoted history is not shown anywhere as the message.
  await expect(messages.getByText("earlier text from the thread", { exact: false })).toHaveCount(0);

  // An edit to the subject is saved, and comes back after a reload.
  const edited = `Edited reply ${stamp}`;
  await messages.getByLabel("Subject", { exact: true }).fill(edited);
  await messages.getByRole("button", { name: "Save edit" }).click();
  await expect(messages.getByRole("button", { name: "Save edit" })).toBeDisabled();
  await page.goto(applicationUrl);
  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(messages.getByLabel("Subject", { exact: true })).toHaveValue(edited);
  await expect(messages.getByLabel("Body", { exact: true })).toHaveValue("Thank you for your email. I am available next week.");

  // The mail link carries the edited subject.
  const href = await messages.getByRole("link", { name: "Open in mail app" }).getAttribute("href");
  expect(href).toMatch(/^mailto:\?subject=/);
  expect(new URL(href!).searchParams.get("subject")).toBe(edited);
  await expectNoViolations(page);
});
