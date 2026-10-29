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

// Ctrl+K, pressed again until the palette shows: a key pressed before React has hydrated the page is lost.
async function openPalette(page: Page) {
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("Control+K");
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
  return palette;
}

async function expectNoViolations(page: Page) {
  // Text that is still fading in fails contrast, so let opening animations finish (endless ones, like spinners, aside).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
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

    test("the command palette has no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      const palette = await openPalette(page);
      await expect(palette.getByRole("option", { name: "New Note" })).toBeVisible();
      await expectNoViolations(page);
    });

    test("All Items has no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      await page.goto("/items");
      await expect(page.getByRole("heading", { name: "All Items", level: 1 })).toBeVisible();
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
  await expect(page.getByRole("dialog", { name: "Knowledge Base" }).getByRole("radio", { name: "Folders" })).toBeVisible();
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

test("the command palette finds a Note by title and searches all text", async ({ page }) => {
  await signIn(page);
  const palette = await openPalette(page);
  const search = palette.getByRole("combobox");

  // A Note with a title nobody else has, made from the palette.
  const title = `Palette probe ${Date.now()}`;
  await palette.getByRole("option", { name: "New Note" }).click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.getByLabel("Title").fill(title);
  await expect(page.getByText(/^Saved at/)).toBeVisible();

  await openPalette(page);
  await search.fill(title);
  await expect(palette.getByRole("option", { name: title, exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Palette/);

  // Tidy up: the probe Note goes to the Trash.
  await openPalette(page);
  await search.fill(title);
  await palette.getByRole("option", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).not.toHaveURL(/\/notes\//);
});

test("on a phone the search icon opens a full-screen palette", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByRole("combobox")).toBeFocused();
  // Polled: it zooms in when it opens.
  await expect.poll(() => palette.boundingBox()).toMatchObject({ x: 0, y: 0, width: 375, height: 812 });
});

test("Import Markdown from the command palette adds the Note and says so", async ({ page }) => {
  await signIn(page);
  await openPalette(page);
  const title = `Imported probe ${Date.now()}`;
  // The palette's hidden file input; the file picker itself is the browser's, so set the file directly.
  await page.getByLabel("Choose Markdown files to import").setInputFiles({
    name: `${title}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(`# ${title}\n\nMade by the end-to-end test.`),
  });
  const added = page.getByRole("listitem").filter({ hasText: `Added ${title}` });
  await expect(added).toBeVisible();

  // Tidy up through the toast's Open button.
  await added.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).not.toHaveURL(/\/notes\//);
});

test("the command palette says it is searching while the answer is on its way", async ({ page }) => {
  await signIn(page);
  const palette = await openPalette(page);
  // Hold the title lookup back, as a slow connection would.
  let release = () => {};
  const held = new Promise<void>((heard) =>
    page.route(/\/quick\?q=./, async (route) => {
      heard();
      await new Promise<void>((resolve) => (release = resolve));
      await route.continue();
    }),
  );
  await palette.getByRole("combobox").fill("anything");
  await held;
  await expect(palette.getByText("Searching…", { exact: true }).first()).toBeVisible();
  release();
  await expect(palette.getByText("Searching…", { exact: true })).toHaveCount(0);
});

// Makes a Note with this title from the command palette and waits until it is saved.
async function newNote(page: Page, title: string) {
  const palette = await openPalette(page);
  await palette.getByRole("option", { name: "New Note" }).click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.getByLabel("Title").fill(title);
  await expect(page.getByText(/^Saved at/)).toBeVisible();
}

test("an Item's row menu moves, tags, trashes and undoes", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const title = `List probe ${stamp}`;
  const folderName = `Probe folder ${stamp}`;
  const tagName = `probe-${stamp}`;
  await newNote(page, title);

  // A Folder to move into, from the panel.
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(folderName);
  await page.getByRole("button", { name: "Create Folder" }).click();

  await page.goto("/items");
  const row = page.getByRole("row").filter({ hasText: title });
  const menu = row.getByRole("button", { name: `Actions for ${title}` });
  await expectNoViolations(page);

  await menu.click();
  await page.getByRole("menuitem", { name: "Move to Folder…" }).click();
  const move = page.getByRole("dialog", { name: "Move to Folder" });
  await move.getByLabel("Folder").selectOption({ label: folderName });
  await move.getByRole("button", { name: "Move" }).click();
  await expect(row.getByRole("cell", { name: folderName })).toBeVisible();
  await expect(menu).toBeFocused();

  // The right-click menu has the same actions.
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add Tag…" }).click();
  const tag = page.getByRole("dialog", { name: "Add a Tag" });
  await tag.getByLabel("Tag name").fill(tagName);
  await tag.getByRole("button", { name: "Add Tag" }).click();
  await expect(page.getByText(`Tagged "${title}"`)).toBeVisible();

  await menu.click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row).toBeVisible();

  // The Tag page lists it, in the same layout.
  await page.goto("/tags");
  await page.getByRole("main").getByRole("link", { name: tagName }).click();
  await expect(page.getByRole("heading", { name: tagName, level: 1 })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();

  // Tidy up: the Note and the Folder go to the Trash, the Tag is deleted.
  await page.getByText("Delete Tag…").click();
  await page.getByRole("button", { name: "Delete Tag" }).click();
  await page.goto("/items");
  await menu.click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: folderName }).click();
  await page.getByText("Move to Trash…").click();
  await page.getByRole("button", { name: "Move Folder to Trash" }).click();
  await expect(page).not.toHaveURL(/\/folders\//);
});

test("on a phone Item rows stack and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  const title = `Phone probe ${Date.now()}`;
  await newNote(page, title);
  await page.goto("/items");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row.getByRole("button", { name: `Actions for ${title}` })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Title" })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expectNoViolations(page);

  await row.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(row).toHaveCount(0);
});
