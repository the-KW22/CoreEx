import { expect, test } from "@playwright/test";
import { expectNoViolations, newApplication, signIn } from "./helpers";

// An Application's workspace shows four tabs (#366); the others are hidden, not deleted.
test("an Application shows four tabs that fit, a hidden tab in the address opens Details, and Mark as applied stays in Details", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 768, height: 900 });
  await signIn(page);
  const company = `Tabs ${Date.now()}`;
  await newApplication(page, company, "Engineer");
  const url = page.url();

  const tabs = page.getByRole("tablist", { name: "Application workspace" });
  await expect(tabs.getByRole("tab")).toHaveText(["Details", "Fit", "Emails", "Interview prep"]);
  // No scroll bar on the tab bar, and none sideways on the page.
  // (The tabs sit 1px low to cover the bar's border, so only the width and the overflow setting say whether it scrolls.)
  expect(await tabs.evaluate((el) => el.scrollWidth <= el.clientWidth && getComputedStyle(el).overflowY === "visible")).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Mark as applied, which lived in the hidden Apply tab, is at the bottom of Details.
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Mark as applied" })).toBeVisible();
  await expectNoViolations(page);

  // A tab that is hidden (as Today used to link to) opens Details; a shown one still opens.
  await page.goto(`${url}?tab=Practice`);
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await page.goto(`${url}?tab=Interview%20prep`);
  await expect(page.getByRole("tab", { name: "Interview prep" })).toHaveAttribute("aria-selected", "true");
  // Practise buttons wait for the Practice tab.
  await expect(page.getByRole("button", { name: /^Practise/ })).toHaveCount(0);

});
