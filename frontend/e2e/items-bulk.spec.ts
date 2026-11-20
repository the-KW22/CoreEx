import { expect, type Page, test } from "@playwright/test";
import { expectNoViolations, newNote, signIn } from "./helpers";

// The List view: capped Tags, buttons in the row, a row that opens the Item, and the bulk bar.
async function listOf(page: Page, titles: string[]) {
  await page.goto("/items");
  await page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "List", exact: true }).click();
  await expect(page.getByRole("table", { name: "Items, most recently updated first" })).toBeVisible();
  return titles.map((title) => page.getByRole("row").filter({ hasText: title }));
}

async function tagRow(page: Page, title: string, tag: string) {
  await page.getByRole("button", { name: `Add a Tag to ${title}` }).click();
  const dialog = page.getByRole("dialog", { name: "Add a Tag" });
  await dialog.getByLabel("Tag name").fill(tag);
  await dialog.getByRole("button", { name: "Add Tag" }).click();
  await expect(page.getByText(`Tagged "${title}"`).first()).toBeVisible();
}

test("a row with many Tags shows two and a +N chip, and its buttons and row click work", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const title = `Many tags ${stamp}`;
  await signIn(page);
  await newNote(page, title);
  const [row] = await listOf(page, [title]);

  for (const tag of ["alpha", "bravo", "charlie", "delta"]) {
    await tagRow(page, title, `${tag}-${stamp}`);
  }
  await expect(row.getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveCount(2);
  await expect(row.getByRole("button", { name: "2 more Tags" })).toHaveText("+2");
  await row.getByRole("button", { name: "2 more Tags" }).click();
  await expect(page.getByRole("list", { name: "All Tags" }).getByRole("listitem")).toHaveCount(4);
  // A click inside the open list is not a click on the row.
  await page.getByRole("list", { name: "All Tags" }).getByRole("listitem").first().click();
  await expect(page).toHaveURL(/\/items$/);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expectNoViolations(page);

  // There is no Open button; the row opens the Note, and a button inside the row does not.
  await expect(row.getByRole("button", { name: "Open" })).toHaveCount(0);
  await page.getByRole("button", { name: `Add a Tag to ${title}` }).click();
  await expect(page.getByRole("dialog", { name: "Add a Tag" })).toBeVisible();
  await expect(page).toHaveURL(/\/items$/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: `Add a Tag to ${title}` })).toBeFocused();
  await row.getByRole("cell", { name: "Top level" }).click();
  await expect(page).toHaveURL(/\/notes\//);

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
});

test("select Items in the list, tag them together, then move them to the Trash and Undo", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const titles = [`Bulk one ${stamp}`, `Bulk two ${stamp}`];
  await signIn(page);
  for (const title of titles) await newNote(page, title);
  const [one, two] = await listOf(page, titles);
  const bar = page.getByRole("region", { name: "Selected Items" });

  await expect(bar).toHaveCount(0);
  await one.getByRole("checkbox", { name: `Select ${titles[0]}` }).check();
  await two.getByRole("checkbox", { name: `Select ${titles[1]}` }).check();
  await expect(bar).toContainText("2 selected");
  await expect(page).toHaveURL(/\/items$/);

  await bar.getByRole("button", { name: "Add Tag" }).click();
  const tag = page.getByRole("dialog", { name: "Add a Tag" });
  await tag.getByLabel("Tag name").fill(`bulk-${stamp}`);
  await tag.getByRole("button", { name: "Add Tag" }).click();
  await expect(page.getByText("Tagged 2 Items")).toBeVisible();
  await expect(one.getByText(`bulk-${stamp}`)).toBeVisible();
  await expect(two.getByText(`bulk-${stamp}`)).toBeVisible();
  await expect(bar).toHaveCount(0);

  // Select all, then clear.
  await page.getByRole("checkbox", { name: "Select all Items on this page" }).check();
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Clear" }).click();
  await expect(bar).toHaveCount(0);

  // Trash asks first; Cancel keeps both and the selection.
  await one.getByRole("checkbox").check();
  await two.getByRole("checkbox").check();
  await bar.getByRole("button", { name: "Move to Trash" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Move 2 Items to the Trash?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(one).toBeVisible();
  await expect(bar).toContainText("2 selected");

  await bar.getByRole("button", { name: "Move to Trash" }).click();
  await confirm.getByRole("button", { name: "Move to Trash" }).click();
  await expect(one).toHaveCount(0);
  await expect(two).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(one).toBeVisible();
  await expect(two).toBeVisible();

  // Tidy up.
  await one.getByRole("button", { name: `Move ${titles[0]} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(one).toHaveCount(0);
  await two.getByRole("button", { name: `Move ${titles[1]} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(two).toHaveCount(0);
});

test("on a phone the row's buttons and checkbox stay reachable and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const title = `Phone bulk ${Date.now()}`;
  await signIn(page);
  await newNote(page, title);
  const [row] = await listOf(page, [title]);
  await expect(row.getByRole("checkbox", { name: `Select ${title}` })).toBeVisible();
  await expect(row.getByRole("button", { name: `Move ${title} to the Trash` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expectNoViolations(page);
  await row.getByRole("button", { name: `Move ${title} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(row).toHaveCount(0);
});
