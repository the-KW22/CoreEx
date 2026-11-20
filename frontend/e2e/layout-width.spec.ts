import { expect, test } from "@playwright/test";

import { expectSaved, newNote, signIn } from "./helpers";

// The case behind #359: the Details panel lists the Notes that link here, and a very long title in one of those cards
// used to set the panel's width and push the whole page sideways (DESIGN.md section 8: no horizontal page scroll).
for (const width of [1280, 1920]) {
  test(`a long-titled Backlink does not make the page scroll sideways at ${width} px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.context().addCookies([{ name: "details", value: "open", url: baseURL! }]);
    await signIn(page);
    const stamp = Date.now();
    const short = `Backlink target ${stamp}`;
    await newNote(page, short);
    const target = page.url();
    await newNote(page, `A deliberately very long title that links back to the target ${"x".repeat(120)} ${stamp}`);
    await page.getByRole("textbox", { name: "Note content" }).click();
    await page.keyboard.type(`See [[${short}`);
    await page.getByRole("option", { name: new RegExp(short) }).click();
    await page.keyboard.type(" ");
    await expectSaved(page);

    await page.goto(target);
    const details = page.getByRole("complementary", { name: "Details" });
    await expect(details.getByRole("region", { name: "Backlinks" }).getByRole("link")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
