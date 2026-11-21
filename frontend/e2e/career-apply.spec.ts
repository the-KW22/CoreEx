import { expect, test } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here): the fake Draft is an 11-word answer that
// cites the first active Fact, and the fake Tighten keeps the first half of the words of the answer it is given.
// The Apply tab is hidden (#366); add it back to SHOWN in workspace.tsx and remove .skip.
test.skip("writes form answers within a limit, drafts and tightens, reuses a library answer and marks the Application applied", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(240_000);
  const stamp = Date.now();
  const company = `Apply ${stamp}`;
  const question = "Why do you want to work here?";
  const apply = page.getByRole("tabpanel", { name: "Apply" });
  const answer = page.getByLabel(`Answer to ${question}`);
  await signIn(page);

  // A Fact for the Draft to cite, and a Resume for Mark as applied to need.
  const fact = `Built web services ${stamp}`;
  await page.goto("/career/knowledge");
  await page.getByLabel("Fact", { exact: true }).fill(fact);
  await page.getByRole("button", { name: "Add Fact" }).click();
  await expect(page.getByText(fact)).toBeVisible();
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const resumeDialog = page.getByRole("dialog", { name: "New Resume" });
  await resumeDialog.getByLabel("Name").fill(company);
  await resumeDialog.getByRole("button", { name: "Create Resume" }).click();
  await expect(page.getByRole("link", { name: company })).toBeVisible();

  // A question with a 10-word limit; a 13-word answer is over it, and the count says so in words.
  await newApplication(page, company, "Engineer");
  await page.getByRole("tab", { name: "Apply" }).click();
  await apply.getByLabel("Question", { exact: true }).fill(question);
  await apply.getByRole("combobox", { name: "Limit" }).selectOption("WORDS");
  await apply.getByLabel("Limit number").fill("10");
  await apply.getByRole("button", { name: "Add question" }).click();
  await expect(answer).toBeVisible();
  await answer.fill("I build web services and I care a lot about clear tested code");
  await expect(apply.getByText("Over the limit by 3 words")).toBeVisible();
  await apply.getByRole("button", { name: "Save answer" }).click();
  await expect(apply.getByRole("button", { name: "Save answer" })).toBeDisabled();

  // Mark as applied is refused with a list: over the limit and no Resume.
  await expect(apply.getByText("Fix these before you mark it as applied:")).toBeVisible();
  await apply.getByRole("button", { name: "Mark as applied" }).click();
  await expect(apply.getByRole("alert").filter({ hasText: "over its limit" })).toContainText("Attach a Resume");
  await expectNoViolations(page);

  // Tighten: a shorter answer within the limit waits for Accept; accepting writes it.
  await expect(apply.getByText(/^Sends: the question, your answer to Claude/)).toBeVisible();
  await apply.getByRole("button", { name: "Tighten" }).click();
  await expect(apply.getByRole("heading", { name: "Tightened answer" })).toBeVisible({ timeout: 30_000 });
  await expect(apply.getByText("6 of 10 words").first()).toBeVisible();
  await apply.getByRole("button", { name: "Accept" }).click();
  await expect(answer).toHaveValue("I build web services and I", { timeout: 15_000 });
  await expect(apply.getByText("6 of 10 words")).toBeVisible();

  // Draft: cites the Fact it was given; one word over the limit is shown, and Reject leaves the answer alone.
  await apply.getByRole("button", { name: "Draft with AI" }).click();
  await expect(apply.getByRole("heading", { name: "Draft", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(apply.getByText("Over the limit by 1 word")).toBeVisible();
  await expect(apply.getByText("Fact:").first()).toBeVisible();
  await apply.getByRole("button", { name: "Reject" }).click();
  await expect(apply.getByRole("heading", { name: "Draft", exact: true })).toHaveCount(0);
  await expect(answer).toHaveValue("I build web services and I");

  // Keep it for this employer only.
  await apply.getByLabel("Keep as").selectOption("EMPLOYER");
  await apply.getByRole("button", { name: "Keep answer" }).click();
  await expect(apply.getByText("Kept for later.")).toBeVisible();

  // The Library shows the results.
  await page.getByRole("tab", { name: "Library" }).click();
  const library = page.getByRole("tabpanel", { name: "Library" });
  await expect(library.getByText("Tightened answer")).toBeVisible();
  await expect(library.getByText("Accepted")).toBeVisible();
  await expect(library.getByText("Rejected")).toBeVisible();

  // A second Application of the same employer is offered the answer; reusing makes a copy.
  await newApplication(page, company, "Designer");
  await page.getByRole("tab", { name: "Apply" }).click();
  await apply.getByLabel("Question", { exact: true }).fill(question);
  await apply.getByRole("button", { name: "Add question" }).click();
  await expect(answer).toBeVisible();
  await apply.getByRole("button", { name: "Find saved answers" }).click();
  await expect(apply.locator("p", { hasText: "This employer only" })).toBeVisible();
  await apply.getByRole("button", { name: /Use this answer/ }).click();
  await expect(answer).toHaveValue("I build web services and I", { timeout: 15_000 });
  await answer.fill("An edited copy");
  await apply.getByRole("button", { name: "Save answer" }).click();
  await expect(apply.getByRole("button", { name: "Save answer" })).toBeDisabled();
  await apply.getByRole("button", { name: "Find saved answers" }).click();
  await expect(apply.getByText("I build web services and I", { exact: true })).toBeVisible();
  await expectNoViolations(page);

  // Another employer is not offered it.
  await newApplication(page, `Other ${stamp}`, "Engineer");
  await page.getByRole("tab", { name: "Apply" }).click();
  await apply.getByLabel("Question", { exact: true }).fill(question);
  await apply.getByRole("button", { name: "Add question" }).click();
  await apply.getByRole("button", { name: "Find saved answers" }).click();
  await expect(apply.getByText("No saved answers match this question yet.")).toBeVisible();

  // Back on the first Application: link the Resume, then Mark as applied records what was sent.
  await page.goto("/career/applications");
  await page.getByRole("link", { name: new RegExp(`Engineer at ${company}`) }).click();
  await page.getByRole("tab", { name: "Details" }).click();
  await page.getByRole("combobox", { name: /^Resume/ }).selectOption({ label: company });
  await page.getByRole("button", { name: "Save Resume link" }).click();
  await expect(page.getByText(`Sent: ${company}`)).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Apply" }).click();
  await expect(apply.getByText("Attach a Resume.")).toHaveCount(0);
  await apply.getByRole("button", { name: "Mark as applied" }).click();
  await expect(apply.getByText(/^Marked as applied on/)).toBeVisible({ timeout: 15_000 });
  await expect(apply.locator("p", { hasText: /^I build web services and I$/ })).toBeVisible();
  await expectNoViolations(page);
});
