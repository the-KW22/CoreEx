import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A local-only test account. The API makes OWNER_EMAIL an Admin with no Invite, so use the same email there.
const email = process.env.E2E_EMAIL ?? "owner@example.com";
const password = process.env.E2E_PASSWORD ?? "coreex-e2e-password";

async function submit(page: Page, button: "Sign in" | "Create account") {
  // React resets the form after each action, so fill it every time.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: button }).click();
}

// Signs in, creating the account the first time on a fresh local database.
async function signIn(page: Page) {
  await page.goto("/login");
  await submit(page, "Sign in");
  // Only the form's error: Next.js's route announcer is also an "alert", outside <main>.
  const failed = page.getByRole("main").getByRole("alert");
  // The rail on wider screens, the menu button on phones (the rail is then inside the menu).
  const signedIn = page.getByRole("navigation", { name: "Main" }).or(page.getByRole("button", { name: "Open the menu" }));
  await expect(signedIn.or(failed)).toBeVisible();
  if (await failed.isVisible()) {
    await submit(page, "Create account");
    // Fails with the form's own message, e.g. an existing account with another password.
    await expect(failed).toHaveCount(0);
  }
  await expect(signedIn).toBeVisible();
}

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const found = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(found).toEqual([]);
}

// Every screen ticket adds its screen here (docs/DESIGN.md section 10).
for (const [colorScheme, background] of [
  ["dark", "rgb(9, 9, 11)"],
  ["light", "rgb(255, 255, 255)"],
] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the signed-in shell has no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      await expect(page.locator("body")).toHaveCSS("background-color", background);
      await expectNoViolations(page);
    });

    test("the phone menu has no WCAG 2.2 AA violations", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await signIn(page);
      await page.getByRole("button", { name: "Open the menu" }).click();
      await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
      await expectNoViolations(page);
    });
  });
}

test("the phone menu closes on Escape, gives focus back and keeps Tab inside", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  const menuButton = page.getByRole("button", { name: "Open the menu" });
  const menu = page.getByRole("dialog", { name: "Menu" });
  // Opening focuses the Sheet itself, so one Escape closes it.
  await menuButton.click();
  await expect(menu.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();

  await menuButton.click();
  await expect(menu).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    await expect(menu.locator(":focus")).toHaveCount(1);
  }
});

test("on a tablet the Knowledge Base panel opens from the rail", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Knowledge Base", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Show the Knowledge Base panel" }).click();
  await expect(page.getByRole("dialog", { name: "Knowledge Base" }).getByRole("search")).toBeVisible();
});

test("the account menu opens from the keyboard and closes on Escape", async ({ page }) => {
  await signIn(page);
  const account = page.getByRole("button", { name: /^Account: / });
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(account).toBeFocused();
});

test("a picked theme overrides the OS and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page);
  await page.getByRole("button", { name: /^Theme: System/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});
