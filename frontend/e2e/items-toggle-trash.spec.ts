import { expect, type Page, test } from "@playwright/test";
import { newNote, signIn } from "./helpers";

// The Items list is a table in list view and a grid otherwise; the header's Grid | List toggle switches between them.
const table = (page: Page) => page.getByRole("table", { name: "Items, most recently updated first" });
const grid = (page: Page) => page.getByRole("list", { name: "Items, most recently updated first" });

test("Grid and List switch the Items view every time, and the last choice survives a reload", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await newNote(page, `Toggle item ${Date.now()}`);
  await page.goto("/items");
  const view = page.getByRole("radiogroup", { name: "View" });

  for (let i = 0; i < 3; i++) {
    await view.getByRole("radio", { name: "Grid", exact: true }).click();
    await expect(grid(page)).toBeVisible();
    await expect(table(page)).toHaveCount(0);

    await view.getByRole("radio", { name: "List", exact: true }).click();
    await expect(table(page)).toBeVisible();
    await expect(grid(page)).toHaveCount(0);
  }

  await view.getByRole("radio", { name: "Grid", exact: true }).click();
  await expect(grid(page)).toBeVisible();
  await page.reload();
  await expect(grid(page)).toBeVisible();
  await expect(table(page)).toHaveCount(0);
});

test("Move to Trash asks first: Cancel and Escape keep the Note, and confirming moves it", async ({ page }) => {
  test.setTimeout(120_000);
  const title = `Confirm trash ${Date.now()}`;
  await signIn(page);
  await newNote(page, title);
  const trash = page.getByRole("button", { name: "Move to Trash" });
  const dialog = page.getByRole("alertdialog", { name: `Move "${title}" to the Trash?` });
  const note = page.getByRole("textbox", { name: "Title" });

  // Cancel closes the dialog and leaves the Note on screen.
  await trash.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(note).toHaveValue(title);

  // Escape does the same.
  await trash.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(note).toHaveValue(title);

  // Confirming sends the Note to the Trash and leaves the page.
  await trash.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});
