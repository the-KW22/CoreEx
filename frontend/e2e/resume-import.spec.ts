import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// A JSON Resume file as a User might have it: read, reviewed, then created with its sections.
const stamp = Date.now();
const name = `Import ${stamp}`;
const file = JSON.stringify({
  basics: { name, label: "Engineer", email: "import@example.com" },
  work: [{ name: "Initech", position: "Developer", startDate: "2019-02", endDate: "", summary: "Wrote <b>reports</b>." }],
  skills: [{ name: "Typing", keywords: ["Fast"] }],
});

test("importing a JSON Resume shows what was read, then creates the Resume from it", async ({ page }) => {
  await signIn(page);
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });

  await dialog.getByLabel("Import a file").setInputFiles({ name: "resume.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await expect(dialog.getByText("Read from a JSON Resume file.")).toBeVisible();
  await expect(dialog.getByText("Experience: 1 entry")).toBeVisible();
  await expect(dialog.getByText("Skills: 1 entry")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(name);

  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("textbox", { name: "Resume name" })).toHaveValue(name);
});
