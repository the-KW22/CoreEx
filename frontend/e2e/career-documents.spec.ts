import { expect, test } from "@playwright/test";
import { expectNoViolations, signIn } from "./helpers";

// A CV, Resumes and Cover Letters each have a page (#368), and a CV is a kind of Resume (#370).
test("the CV, Resumes and Cover Letters pages: a Resume is made from a CV, and the old Library lands on Resumes", async ({ page }) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const cvName = `Master CV ${stamp}`;
  await signIn(page);

  // The menu lists the three pages, and the Library is gone.
  await page.goto("/career/cv");
  await expect(page.getByRole("heading", { name: "CV", level: 1 })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Career" });
  await expect(menu.getByRole("link", { name: "CV", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Resumes", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Cover Letters", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: /Library|Resumes & Letters/ })).toHaveCount(0);
  await page.goto("/career/library");
  await expect(page).toHaveURL(/\/career\/resumes$/);

  // A CV is made on its page and is labelled CV; it is not listed with the Resumes.
  await page.goto("/career/cv");
  await page.getByRole("button", { name: "New CV", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New CV" });
  await dialog.getByLabel("Name").fill(cvName);
  await dialog.getByRole("button", { name: "Create CV" }).click();
  const cvRow = page.getByRole("listitem").filter({ hasText: cvName });
  await expect(cvRow).toBeVisible();
  await expect(cvRow.getByText("CV", { exact: true })).toBeVisible();
  await expectNoViolations(page);
  await page.goto("/career/resumes");
  await expect(page.getByRole("listitem").filter({ hasText: cvName })).toHaveCount(0);

  // New Resume from CV copies it into a Resume that is not linked to an Application.
  await page.getByRole("button", { name: "New Resume from CV" }).click();
  const from = page.getByRole("dialog", { name: "New Resume from CV" });
  await from.getByLabel("CV").selectOption({ label: cvName });
  await from.getByRole("button", { name: "Make a Resume" }).click();
  const copy = page.getByRole("listitem").filter({ hasText: `${cvName} (copy)` });
  await expect(copy).toBeVisible();
  await expect(copy.getByText("Not linked to an Application")).toBeVisible();
  await expectNoViolations(page);

  // The CV page still has only the CV.
  await page.goto("/career/cv");
  await expect(page.getByRole("listitem").filter({ hasText: `${cvName} (copy)` })).toHaveCount(0);

  // A Cover Letter has its own page, with its Application and Resume.
  await page.goto("/career/cover-letters");
  await expect(page.getByRole("heading", { name: "Cover Letters", level: 1 })).toBeVisible();
  const letter = `Letter ${stamp}`;
  await page.getByRole("button", { name: "New Cover Letter" }).click();
  const made = page.getByRole("dialog", { name: "New Cover Letter" });
  await made.getByLabel("Name", { exact: true }).fill(letter);
  await made.getByRole("button", { name: "Create Cover Letter" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: letter })).toContainText("Not linked to an Application");
  await expectNoViolations(page);

  // Tidy up.
  await page.goto(`/career/resumes?q=${cvName}`);
  await page.getByRole("button", { name: `Move to Trash: ${cvName} (copy)` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `${cvName} (copy)` })).toHaveCount(0);
  await page.goto(`/career/cv?q=${cvName}`);
  await page.getByRole("button", { name: `Move to Trash: ${cvName}` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: cvName })).toHaveCount(0);
});
