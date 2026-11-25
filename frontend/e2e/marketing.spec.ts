import { expect, test } from "@playwright/test";

import { expectNoViolations, signIn } from "./helpers";

// The public marketing page (docs/DESIGN.md "Marketing page"). The signed-out tests need only the frontend; the
// signed-in one needs the local stack.
for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`marketing page, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test("signed out, / shows the marketing page and it has no sideways scroll or axe violations", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1, name: "Everything you know, connected." })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Request access" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
      await expectNoViolations(page);
    });

    test("the page has no sideways scroll at 375px", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

test("reduced motion shows the window flat", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("signed in, / is still Home", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything you know, connected." })).toHaveCount(0);
});
