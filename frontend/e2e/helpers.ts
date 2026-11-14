import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

// A local-only test account. The API makes OWNER_EMAIL an Admin with no Invite, so use the same email there.
export const email = process.env.E2E_EMAIL ?? "owner@example.com";
export const password = process.env.E2E_PASSWORD ?? "coreex-e2e-password";

export async function submit(page: Page, button: "Sign in" | "Create account") {
  // React resets the form after each action, so fill it every time.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: button }).click();
}

// Signs in, creating the account the first time on a fresh local database.
export async function signIn(page: Page) {
  // The Items pages open as a grid; most tests read them as a table, so they start in the list view.
  await page.context().addCookies([{ name: "view", value: "list", url: test.info().project.use.baseURL! }]);
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

// Ctrl+K, pressed again until the palette shows: a key pressed before React has hydrated the page is lost.
export async function openPalette(page: Page) {
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("Control+K");
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
  return palette;
}

export async function expectNoViolations(page: Page) {
  // Text that is still fading in fails contrast, so let opening animations finish (endless ones, like spinners, aside).
  await page.waitForFunction(
    () =>
      document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity) &&
      // Motion fades with inline styles rather than CSS animations. Fully transparent parts are skipped by axe anyway.
      [...document.querySelectorAll<HTMLElement>("[style*=opacity]")].every((el) => {
        const opacity = Number(el.style.opacity);
        return opacity === 0 || opacity === 1;
      }),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const found = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(found).toEqual([]);
}

// Waits until the open Note has saved what was just typed. "Saved at" also shows before typing, so the change must
// register first. By role: Next keeps the previous page's DOM hidden for back and forward, and getByRole skips it.
export async function expectSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Saved at/ })).toBeVisible();
}

// Makes a Note with this title from the command palette and waits until it is saved.
export async function newNote(page: Page, title: string) {
  const palette = await openPalette(page);
  await palette.getByRole("option", { name: "New Note" }).click();
  await expect(page).toHaveURL(/\/notes\//);
  // The page being left stays on screen for a moment after the address changes: wait for the new, empty Note.
  const field = page.getByRole("textbox", { name: "Title" });
  await expect(field).toHaveCount(1);
  await expect(field).toHaveValue("");
  await field.fill(title);
  await expectSaved(page);
}

// An Application made from the home page's New Application dialog; leaves you on its page.
export async function newApplication(page: Page, company: string, role: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "New Application" }).click();
  const dialog = page.getByRole("dialog", { name: "New Application" });
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByLabel("Posting").fill("We are hiring.");
  await dialog.getByRole("button", { name: "Add Application" }).click();
  await expect(page).toHaveURL(/\/career\/applications\//);
  await expect(page.getByRole("heading", { name: `${role} at ${company}`, level: 1 })).toBeVisible();
}

// A Note carrying a new Tag, so the Tags page has a row. Leaves you on the Note.
export async function noteWithTag(page: Page, title: string, tagName: string) {
  await newNote(page, title);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByPlaceholder("Find or create a Tag").fill(tagName);
  await page.getByRole("option", { name: `Create “${tagName}”` }).click();
  await expect(page.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName })).toBeVisible();
}

// Picks a Folder in a Folder Select, a styled listbox rather than a native <select>.
export async function chooseFolder(page: Page, scope: Page | Locator, label: string, folder: string) {
  await scope.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: folder, exact: true }).click();
}

// Opens a confirm with its button and presses the confirm's action, retrying the pair: a click before React has
// hydrated the page is lost, and on the Tag page the confirm sometimes closes again just after it opens.
export async function confirmDialog(page: Page, opener: string, action: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: opener, exact: true }).click();
    await dialog.getByRole("button", { name: action }).click({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

// Deletes a Tag from the Tags page or its own page, through the confirm.
export async function deleteTag(page: Page, tagName: string) {
  await confirmDialog(page, `Delete ${tagName}`, "Delete Tag");
}

// A Note with a unique title, sent to the Trash from its own screen. Leaves you on All Items.
export async function trashedNote(page: Page, title: string) {
  await newNote(page, title);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
}

// Sends Items to the Trash from their rows in All Items. A fresh page for each: the toast from one can sit over the
// next one's menu and take its click.
export async function trashRows(page: Page, titles: string[]) {
  for (const title of titles) {
    await page.goto("/items");
    const row = page.getByRole("row").filter({ hasText: title });
    await row.getByRole("button", { name: `Actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    await expect(row).toHaveCount(0);
  }
}

// A 1×1 PNG.
export const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Moves the Folder being viewed to the Trash through its confirm.
export async function trashFolder(page: Page, folderName: string) {
  await confirmDialog(page, `Move ${folderName} to Trash`, "Move Folder to Trash");
}
