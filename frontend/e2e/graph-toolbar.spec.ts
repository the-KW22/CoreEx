import { expect, test } from "@playwright/test";
import { deleteTag, expectNoViolations, noteWithTag, signIn, trashRows } from "./helpers";

// The Graph's one toolbar (Find, Folders, Links | Tree, Filters) and its Filters control.
test("the Graph toolbar is the same in Links and Tree, and the graph fits the window", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await signIn(page);
  const stamp = Date.now();
  const title = `Graph bar ${stamp}`;
  const tag = `bar-${stamp}`;
  await noteWithTag(page, title, tag);
  await page.goto("/graph");

  const parts = () => ({
    find: page.getByRole("combobox", { name: "Find an Item in the graph" }),
    folders: page.getByRole("button", { name: /^Folders/ }),
    mode: page.getByRole("radiogroup", { name: "Draw the graph by" }),
    filters: page.getByRole("button", { name: /^Filters/ }),
  });
  const boxes = () => Promise.all(Object.values(parts()).map((locator) => locator.boundingBox()));
  // No page scroll bar: the document is no taller than the window.
  const fits = () => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);

  await expect(parts().filters).toBeVisible();
  const links = await boxes();
  expect(await fits()).toBe(true);

  // Gone: the Folder dropdown, Show as table, the Grid | List | Graph toggle and Insights.
  await expect(page.getByLabel("Folder", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /table/i })).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: "View" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Insights" })).toHaveCount(0);

  // The first click can land before the page is interactive, so it is repeated until it takes.
  await expect(async () => {
    await parts().mode.getByRole("radio", { name: "Tree" }).click();
    await expect(page).toHaveURL(/mode=tree/, { timeout: 2000 });
  }).toPass();
  await expect(parts().filters).toBeVisible();
  const tree = await boxes();
  // Nothing moved: every part sits where it did.
  tree.forEach((box, i) => {
    expect(Math.abs(box!.x - links[i]!.x)).toBeLessThan(2);
    expect(Math.abs(box!.y - links[i]!.y)).toBeLessThan(2);
  });
  expect(await fits()).toBe(true);

  // With the panel hidden the Folders button names the Folder being shown, and brings the panel back.
  await parts().folders.click();
  await expect(page.getByRole("complementary", { name: "Folders" })).toBeHidden();
  await expect(parts().folders).toHaveText(/Folders: All Items/);
  await parts().folders.click();
  await expect(page.getByRole("complementary", { name: "Folders" })).toBeVisible();

  // ?table= is ignored.
  await page.goto("/graph?table=1");
  await expect(parts().filters).toBeVisible();
  await expectNoViolations(page);

  await page.goto("/items");
  await trashRows(page, [title]);
  await page.goto("/tags");
  await deleteTag(page, tag);
});

test("Filters is one control: Type, Tags and the rest, shown as chips that remove one by one", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const tag = `flt-${stamp}`;
  await signIn(page);
  const title = `Filter note ${stamp}`;
  await noteWithTag(page, title, tag);
  await page.goto("/graph");

  const chips = page.getByRole("list", { name: "Active filters" });
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("combobox", { name: "Type" }).selectOption("NOTE");
  await expect(page).toHaveURL(/type=NOTE/);
  // The page reads the address again before the next choice builds on it.
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  await page.getByRole("combobox", { name: "Find a Tag" }).fill(tag);
  await page.getByRole("option", { name: tag }).click();
  await expect(page).toHaveURL(/tag=/);
  await expect(page).toHaveURL(/type=NOTE/);
  await expectNoViolations(page);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "Filters (2)" })).toBeVisible();
  await expect(chips.getByRole("button", { name: "Remove filter: Note" })).toBeVisible();
  await expect(chips.getByRole("button", { name: `Remove filter: ${tag}` })).toBeVisible();

  // A shared link keeps working: the address alone restores the filters.
  await page.reload();
  await expect(chips.getByRole("button", { name: "Remove filter: Note" })).toBeVisible();

  // Back puts the filters of the earlier address back: Tree is a new entry, the chip is removed there, Back restores it.
  await expect(async () => {
    await page.getByRole("radiogroup", { name: "Draw the graph by" }).getByRole("radio", { name: "Tree" }).click();
    await expect(page).toHaveURL(/mode=tree/, { timeout: 2000 });
  }).toPass();
  await chips.getByRole("button", { name: "Remove filter: Note" }).click();
  await expect(chips.getByRole("button", { name: "Remove filter: Note" })).toHaveCount(0);
  await page.goBack();
  await expect(page).not.toHaveURL(/mode=tree/);
  await expect(chips.getByRole("button", { name: "Remove filter: Note" })).toBeVisible();

  await chips.getByRole("button", { name: "Remove filter: Note" }).click();
  await expect(page).not.toHaveURL(/type=NOTE/);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/tag=/);
  await expect(chips).toHaveCount(0);

  await page.goto("/items");
  await trashRows(page, [title]);
  await page.goto("/tags");
  await deleteTag(page, tag);
});

test("on a phone Filters and Folders open as Sheets and the page does not scroll sideways", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto("/graph");
  const folders = page.getByRole("button", { name: /^Folders: All Items/ });
  await expect(folders).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("dialog", { name: "Filters" }).getByRole("combobox", { name: "Type" })).toBeVisible();
  await expectNoViolations(page);
  await page.keyboard.press("Escape");

  await folders.click();
  await expect(page.getByRole("dialog", { name: "Folders" })).toBeVisible();
});
