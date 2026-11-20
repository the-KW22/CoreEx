import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// One sidebar (#358): the rail shows the Knowledge Base or Career panel in its place, under a Back button.
const main = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test("the Knowledge Base panel is inside the rail, and Back shows the module list without leaving the page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await page.goto("/items");
  const rail = main(page);
  const panel = rail.getByRole("complementary", { name: "Knowledge Base" });
  await expect(panel).toBeVisible();
  // One sidebar column: nothing beside the rail but the page.
  await expect(page.getByRole("complementary", { name: "Knowledge Base" })).toHaveCount(1);
  // The module list is inert (not focusable, not clickable) while the panel shows.
  await expect(rail.locator("[inert]").getByRole("link", { name: "Home" })).toHaveCount(1);

  await rail.getByRole("button", { name: "Back to the menu" }).click();
  await expect(rail.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Knowledge Base" })).toBeFocused();
  await expect(rail.locator("[inert]").getByRole("complementary", { name: "Knowledge Base" })).toHaveCount(1);
  await expect(page).toHaveURL(/\/items$/);

  // Choosing the module again drills back in, with focus on Back.
  await rail.getByRole("link", { name: "Knowledge Base" }).click();
  await expect(panel).toBeVisible();
  await expect(rail.getByRole("button", { name: "Back to the menu" })).toBeFocused();
});

test("a Career page opens with the Career panel showing, also after a refresh", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await page.goto("/career/applications");
  const panel = main(page).getByRole("complementary", { name: "Career" });
  await expect(panel).toBeVisible();
  await page.reload();
  await expect(panel).toBeVisible();
  // Another module has no panel.
  await main(page).getByRole("button", { name: "Back to the menu" }).click();
  await main(page).getByRole("link", { name: "Graph" }).click();
  await expect(page).toHaveURL(/\/graph/);
  await expect(main(page).getByRole("button", { name: "Back to the menu" })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: "Home" })).toBeVisible();
});

test("a collapsed rail only has icons: they navigate, and the panel opens in a Sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await page.goto("/items");
  await main(page).getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(main(page).getByRole("complementary")).toHaveCount(0);
  await main(page).getByRole("link", { name: "Career" }).click();
  await expect(page).toHaveURL(/\/career/);
  await main(page).getByRole("button", { name: "Show the Career panel" }).click();
  await expect(page.getByRole("dialog", { name: "Career" })).toBeVisible();
});

test("on a phone the menu Sheet drills into the panel the same way", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page);
  await page.goto("/items");
  await page.getByRole("button", { name: "Open the menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByRole("complementary", { name: "Knowledge Base" })).toBeVisible();
  await menu.getByRole("button", { name: "Back to the menu" }).click();
  await expect(menu.getByRole("link", { name: "Home" })).toBeVisible();
  // There is no separate Panel button any more.
  await expect(menu.getByRole("button", { name: /panel/i })).toHaveCount(0);
});

// #363: only the list scrolls, so Manage Tags is on screen however many Tags there are, and Tags are rows, not a cloud.
test("the Tags view lists Tags one a row, with Manage Tags always in reach", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await signIn(page);
  await page.goto("/items");
  const panel = main(page).getByRole("complementary", { name: "Knowledge Base" });
  await panel.getByRole("radio", { name: "Tags" }).click();
  await expect(panel.getByRole("link", { name: "Manage Tags" })).toBeInViewport();
  await expect(panel.getByRole("list", { name: "Tags" }).or(panel.getByText("No Tags yet."))).toBeVisible();
});
