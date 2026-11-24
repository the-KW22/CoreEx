import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Today and Offers are hidden (#367): the Career panel has neither entry, and their URLs land on Applications.
test("the Career panel has no Today or Offers, and their URLs land on Applications", async ({ page }) => {
  await signIn(page);
  await page.goto("/items");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Back to the menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Career" }).click();
  const panel = page.getByRole("navigation", { name: "Career" });
  await expect(panel.getByRole("link", { name: "Applications" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Today", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Offers", exact: true })).toHaveCount(0);

  await page.goto("/career");
  await expect(page).toHaveURL(/\/career\/applications$/);
  await page.goto("/career/offers");
  await expect(page).toHaveURL(/\/career\/applications$/);
});
