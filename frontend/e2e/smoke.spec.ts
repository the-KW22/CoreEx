import { expect, test } from "@playwright/test";

import { PIXEL, expectSaved, newNote, signIn } from "./helpers";

// One flow, the way a person uses CoreEx. `npx playwright test smoke` answers "does the app work" in about a minute.
test("smoke: write, link, upload, search, and tidy up", async ({ page }) => {
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const word = `zq${stamp}`;
  const first = `Smoke first ${stamp}`;
  const second = `Smoke second ${stamp}`;
  const image = `smoke-${stamp}.png`;

  // 1. A Note with a few lines, made from the palette.
  await newNote(page, first);
  const body = page.getByRole("textbox", { name: "Note content" });
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`A line about ${word}.`);
  await page.keyboard.press("Enter");
  await page.keyboard.type("A second line.");
  await expectSaved(page);

  // 2. A second Note that links to the first with [[ autocomplete.
  await newNote(page, second);
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`See [[${first}`);
  await page.getByRole("option", { name: new RegExp(first) }).click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Linked.");
  await expectSaved(page);

  // 3. The first Note lists the second as a Backlink.
  await page.goto("/items");
  await page.getByRole("row").filter({ hasText: first }).getByRole("link", { name: first }).click();
  await expect(page).toHaveURL(/\/notes\//);
  const backlinks = page.getByRole("complementary", { name: "Details" }).getByRole("region", { name: "Backlinks" });
  await expect(backlinks.getByRole("link", { name: second })).toBeVisible();

  // 4. An image through the Upload dialog, opened on the Asset screen.
  await page.goto("/items");
  await page.getByRole("button", { name: "Upload", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload files" });
  await dialog.getByLabel("Choose files").setInputFiles({ name: image, mimeType: "image/png", buffer: PIXEL });
  await dialog.getByRole("link", { name: image }).click();
  await expect(page).toHaveURL(/\/assets\//);
  await expect(page.getByRole("img", { name: image })).toBeVisible();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);

  // 5. Search finds the first Note by a word in its body and opens it from the result.
  await page.goto(`/search?q=${word}`);
  const hit = page.getByRole("listitem").filter({ hasText: first });
  await expect(hit.locator("mark")).toHaveText(word);
  await hit.getByRole("link", { name: first }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(first);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);

  // 6. Tidy up: the second Note to the Trash, then all three deleted for good.
  const secondRow = page.getByRole("row").filter({ hasText: second });
  await secondRow.getByRole("button", { name: `Move ${second} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(secondRow).toHaveCount(0);

  await page.goto("/trash");
  for (const title of [first, second, image]) {
    const row = page.getByRole("row").filter({ hasText: title });
    await row.getByRole("button", { name: `Delete forever: ${title}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
    await expect(row).toHaveCount(0);
  }
});
