import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectSaved, newNote, openPalette, signIn, trashFolder, trashedNote } from "./helpers";

// Keyboard-only flows (docs/DESIGN.md section 10). Setup may use the mouse; the flow under test does not. Each step
// checks that focus is visible and lands where it should, including the return to the opener when a dialog closes.

// Presses Tab until the element has focus, so the test breaks if it stops being reachable by keyboard.
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      expect(await target.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${target}`);
}

test("from the keyboard: sign in, open a Note from the palette, tag it and move it", async ({ page }) => {
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const title = `kbd${stamp}`; // one word nobody else has, so it is the palette's only hit
  const tagName = `keys-${stamp}`;
  const folderName = `kf${stamp}`;

  // Setup with the mouse: a Folder to move into, and a Note to find.
  await page.goto("/items");
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(folderName);
  await page.getByRole("button", { name: "Create Folder" }).click();
  await newNote(page, title);
  await page.goto("/");

  // The palette opens and picks a result with the keyboard alone.
  const palette = await openPalette(page);
  await page.keyboard.type(title);
  await expect(palette.getByRole("option", { name: title, exact: true })).toBeVisible();
  // The selection stays on the "Search all text" row, which is below the results: arrow up to the Note.
  const result = palette.getByRole("option", { name: title, exact: true });
  for (let i = 0; i < 4 && (await result.getAttribute("aria-selected")) !== "true"; i++) {
    await page.keyboard.press("ArrowUp");
  }
  await expect(result).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(title);

  // "+ Tag": open it, create a Tag, and focus comes back to the button that opened it.
  const addTag = page.getByRole("button", { name: "Tag", exact: true });
  await tabTo(page, addTag);
  await page.keyboard.press("Enter");
  await page.keyboard.type(tagName);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName })).toBeVisible();
  await expect(addTag).toBeFocused();

  // Details: the Folder select is reachable by keyboard, and an arrow key moves the Note (a toast says so).
  const folder = page.getByRole("complementary", { name: "Details" }).getByLabel("Folder");
  await tabTo(page, folder);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByText("Moved", { exact: true })).toBeVisible();

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.goto("/trash");
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: `Delete forever: ${title}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await page.goto("/tags");
  await page.getByRole("button", { name: `Delete ${tagName}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete Tag" }).click();
  await page.goto("/items");
  await page.getByRole("main").getByRole("link", { name: folderName }).click();
  await trashFolder(page, folderName);
});

test("from the keyboard: Trash confirms, with focus in the dialog and back on the opener", async ({ page }) => {
  await signIn(page);
  const title = `Keys trash ${Date.now()}`;
  await trashedNote(page, title);
  await page.goto("/trash");

  const row = page.getByRole("row").filter({ hasText: title });
  const restore = row.getByRole("button", { name: `Restore ${title}` });
  const remove = row.getByRole("button", { name: `Delete forever: ${title}` });
  await tabTo(page, restore);
  await page.keyboard.press("Tab");
  await expect(remove).toBeFocused();

  // Open the confirm: focus moves inside it, Escape closes it, and focus returns to the opener.
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();

  // Open it again and confirm with the keyboard.
  await page.keyboard.press("Enter");
  await tabTo(page, dialog.getByRole("button", { name: "Delete forever" }));
  await page.keyboard.press("Enter");
  await expect(row).toHaveCount(0);
});

test("from the keyboard: the editor keeps what is typed and the save status follows", async ({ page }) => {
  await signIn(page);
  const title = `Keys edit ${Date.now()}`;
  await newNote(page, title);
  await page.getByRole("textbox", { name: "Note content" }).focus();
  await page.keyboard.type("Typed without a mouse.");
  await expectSaved(page);
  await page.getByRole("button", { name: "Move to Trash" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/items$/);
});
