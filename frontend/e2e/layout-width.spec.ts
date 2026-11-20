import { expect, test, type Page } from "@playwright/test";

import { newApplication, newNote, signIn } from "./helpers";

// DESIGN.md section 8: the page never scrolls sideways, even with the Details panel open (issue #359).
async function expectNoSideScroll(page: Page) {
  await expect(page.getByRole("complementary", { name: "Details" })).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
}

for (const width of [1280, 1440, 1920]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("a Note with its Details panel open does not scroll sideways", async ({ page, baseURL }) => {
      // The Details choice is remembered in a cookie: open it explicitly rather than rely on the screen width.
      await page.context().addCookies([{ name: "details", value: "open", url: baseURL! }]);
      await signIn(page);
      // A long title, which is what makes the panel's list items wide.
      await newNote(page, `Layout width probe with a deliberately very long title ${Date.now()} ${"x".repeat(120)}`);
      await expectNoSideScroll(page);
    });

    test("an Application with its Details panel open does not scroll sideways", async ({ page, baseURL }) => {
      await page.context().addCookies([{ name: "details", value: "open", url: baseURL! }]);
      await signIn(page);
      await newApplication(page, `Width Probe Co ${Date.now()}`, "Engineer");
      await expectNoSideScroll(page);
    });
  });
}
