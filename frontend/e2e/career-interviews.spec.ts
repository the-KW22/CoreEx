import { expect, test, type Page } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

async function addFact(page: Page, fact: string) {
  await page.goto("/career/knowledge");
  await page.getByLabel("Fact", { exact: true }).fill(fact);
  await page.getByRole("button", { name: "Add Fact" }).click();
  await expect(page.getByText(fact)).toBeVisible();
}

// Adds an interview in the Details tab of the Application open on the page.
async function addInterview(page: Page, when: string, shown: string) {
  const details = page.getByRole("tabpanel", { name: "Details" });
  await details.getByRole("button", { name: "Add interview" }).click();
  await details.getByLabel("Interview time").fill(when);
  await details.getByRole("button", { name: "Save interview" }).click();
  await expect(details.getByText(shown).first()).toBeVisible();
}

// Needs the API started with COREEX_AI_PROVIDER=fake (and E2E_FAKE_AI=1 here): the fake Interview prep cites the first
// active Fact it is given, and the fake Practice feedback quotes the first four words of the typed answer.
test("prepares for an upcoming interview from evidence and marks it Out of date", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  const fact = `Built web services ${stamp}`;
  await signIn(page);
  await addFact(page, fact);

  const company = `Prep ${stamp}`;
  await newApplication(page, company, "Engineer");
  const applicationUrl = page.url();
  await addInterview(page, "2030-03-05T17:30", "Mar 5, 2030, 5:30 PM");

  await page.getByRole("tab", { name: "Interview prep" }).click();
  const prep = page.getByRole("tabpanel", { name: "Interview prep" });
  await expect(prep.getByText(/^Sends: the posting, your Resume, your Knowledge, your Stories, the interview/)).toBeVisible();
  await prep.getByRole("button", { name: "Prepare for interview" }).click();
  await expect(prep.getByText("Pick two stories", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(prep.getByText("Reread the posting", { exact: true })).toBeVisible();
  await expect(prep.getByText("Rehearse out loud", { exact: true })).toBeVisible();
  await expect(prep.getByText("Stress your web services work", { exact: true })).toBeVisible();
  // The fake model cites the first active Fact it is given, which on a used database may not be the one added above.
  const cited = (await prep.locator("q").first().innerText()).trim();
  await expect(prep.getByText("What does a first month look like?", { exact: true })).toBeVisible();
  await expect(prep.getByText("Why do you want this role?", { exact: true }).first()).toBeVisible();
  await expectNoViolations(page);

  // The Library lists the prep as its own kind of result.
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.getByRole("tabpanel", { name: "Library" }).getByText("Interview prep", { exact: true })).toBeVisible();

  // Changing the cited Fact makes the prep Out of date until it is made again.
  await page.goto("/career/knowledge");
  const row = page.getByRole("listitem").filter({ hasText: cited }).first();
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Fact text").fill(`${cited} and more`);
  await page.getByRole("listitem").filter({ has: page.getByLabel("Fact text") }).getByRole("button", { name: "Save Fact" }).click();
  await expect(page.getByText(`${cited} and more`)).toBeVisible();
  await page.goto(applicationUrl);
  await page.getByRole("tab", { name: "Interview prep" }).click();
  await expect(prep.getByText("Out of date.", { exact: true })).toBeVisible();
  await prep.getByRole("button", { name: "Prepare again" }).click();
  await expect(prep.getByText("Out of date.", { exact: true })).toHaveCount(0, { timeout: 30_000 });
});

test("types a practice answer and gets feedback quoting only that answer", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  await signIn(page);
  await addFact(page, `Built web services ${stamp}`);

  await newApplication(page, `Practice ${stamp}`, "Engineer");
  await addInterview(page, "2030-03-05T17:30", "Mar 5, 2030, 5:30 PM");
  await page.getByRole("tab", { name: "Interview prep" }).click();
  const prep = page.getByRole("tabpanel", { name: "Interview prep" });
  await prep.getByRole("button", { name: "Prepare for interview" }).click();
  await expect(prep.getByText("Pick two stories", { exact: true })).toBeVisible({ timeout: 30_000 });

  // "Practise" opens the Practice tab with the question filled in.
  await prep.getByRole("button", { name: "Practise Tell me about yourself." }).click();
  const practice = page.getByRole("tabpanel", { name: "Practice" });
  await expect(practice.getByLabel("Practice question", { exact: true })).toHaveValue("Tell me about yourself.");

  await practice.getByLabel("Your answer", { exact: true }).fill("I build reliable web services every day");
  await practice.getByRole("button", { name: "Get feedback" }).click();
  await expect(practice.locator("q").filter({ hasText: /^I build reliable web$/ })).toBeVisible({ timeout: 30_000 });
  await expect(practice.getByText("Add one concrete result.", { exact: false })).toBeVisible();
  await expectNoViolations(page);

  // A second attempt moves the first one under Earlier attempts.
  await practice.getByLabel("Your answer", { exact: true }).fill("Second answer goes here");
  await practice.getByRole("button", { name: "Get feedback" }).click();
  await expect(practice.locator("q").filter({ hasText: /^Second answer goes here$/ })).toBeVisible({ timeout: 30_000 });
  const earlier = practice.getByRole("region", { name: "Earlier attempts" });
  await expect(earlier.getByText("I build reliable web services every day", { exact: true })).toBeVisible();
  await expectNoViolations(page);
});

test("records a Debrief for an interview and summarises what to improve", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  test.setTimeout(180_000);
  const stamp = Date.now();
  await signIn(page);
  await newApplication(page, `Debrief ${stamp}`, "Engineer");
  await addInterview(page, "2020-03-05T17:30", "Mar 5, 2020, 5:30 PM");

  await page.getByRole("tab", { name: "Debrief" }).click();
  const debrief = page.getByRole("tabpanel", { name: "Debrief" });
  const notes = `Went through the stack ${stamp}`;
  await debrief.getByLabel("Notes", { exact: true }).fill(notes);
  await debrief.getByRole("button", { name: "Add question" }).click();
  await debrief.getByLabel("Question", { exact: true }).fill("Describe a hard bug");
  await debrief.getByLabel("How it landed", { exact: true }).selectOption("MIXED");
  await debrief.getByRole("button", { name: "Save Debrief" }).click();
  await expect(debrief.getByRole("button", { name: "Summarise what to improve" })).toBeVisible();

  // The saved Debrief comes back after a reload.
  await page.reload();
  await page.getByRole("tab", { name: "Debrief" }).click();
  await expect(debrief.getByLabel("Notes", { exact: true })).toHaveValue(notes);
  await expect(debrief.getByLabel("Question", { exact: true })).toHaveValue("Describe a hard bug");
  await expect(debrief.getByLabel("How it landed", { exact: true })).toHaveValue("MIXED");

  await debrief.getByRole("button", { name: "Summarise what to improve" }).click();
  await expect(debrief.getByText("Give a specific example next time.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(page);

  // Editing the notes and saving makes the summary Out of date.
  await debrief.getByLabel("Notes", { exact: true }).fill(`${notes} and more`);
  await debrief.getByRole("button", { name: "Save Debrief" }).click();
  await expect(debrief.getByText("Out of date.", { exact: true })).toBeVisible();
  await expectNoViolations(page);
});
