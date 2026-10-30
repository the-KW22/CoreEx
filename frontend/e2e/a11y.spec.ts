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

    test("Home has no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      await expect(page.getByRole("heading", { name: "Welcome", level: 1 })).toBeVisible();
      // Past the loading skeleton.
      await expect(page.getByRole("status").filter({ hasText: "Loading your Home" })).toHaveCount(0);
      await expectNoViolations(page);
    });

    test("the Note screen has no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      await newNote(page, `A11y probe ${Date.now()}`);
      await expect(page.getByRole("complementary", { name: "Details" })).toBeVisible();
      await expectNoViolations(page);
      await page.getByRole("button", { name: "Move to Trash" }).click();
      await expect(page).toHaveURL(/\/items$/);
    });

    test("All Items has no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      await page.goto("/items");
      await expect(page.getByRole("heading", { name: "All Items", level: 1 })).toBeVisible();
      await expectNoViolations(page);
    });

    test("the Tags page, its colour picker and the delete confirm have no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      const stamp = Date.now();
      const tagName = `a11y-tag-${stamp}`;
      await noteWithTag(page, `Tag probe ${stamp}`, tagName);
      await page.goto("/tags");
      await expect(page.getByRole("heading", { name: "Tags", level: 1 })).toBeVisible();
      await expectNoViolations(page);

      await page.getByRole("button", { name: `Colour of ${tagName}` }).click();
      await expect(page.getByRole("radiogroup", { name: `Colour of ${tagName}` })).toBeVisible();
      await expectNoViolations(page);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: `Delete ${tagName}` }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectNoViolations(page);
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete Tag" }).click();
      await expect(page.getByRole("link", { name: tagName })).toHaveCount(0);

      await page.goto("/items");
      await page.getByRole("button", { name: `Actions for Tag probe ${stamp}` }).click();
      await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    });

    test("the Trash and Search pages have no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      const word = `zq${Date.now()}`;
      await newNote(page, `Trash axe ${word}`);
      await page.locator(".cm-content").click();
      await page.keyboard.type(`about ${word}`);
      await expectSaved(page);

      await page.goto(`/search?q=${word}`);
      await expect(page.locator("main mark")).toBeVisible();
      await expectNoViolations(page);

      await page.getByRole("link", { name: new RegExp(word) }).click();
      await page.getByRole("button", { name: "Move to Trash" }).click();
      await expect(page).toHaveURL(/\/items$/);
      await page.goto("/trash");
      const row = page.getByRole("row").filter({ hasText: word });
      await expect(row).toBeVisible();
      await expectNoViolations(page);

      await row.getByRole("button", { name: /^Delete forever/ }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectNoViolations(page);
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
      await expect(row).toHaveCount(0);
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
  // The page being left stays on screen for a moment after the address changes: wait for the new, empty Note.
  const field = page.getByRole("textbox", { name: "Title" });
  await expect(field).toHaveCount(1);
  await expect(field).toHaveValue("");
  await field.fill(title);
  await expectSaved(page);

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
  await page.getByRole("main").getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByRole("combobox")).toBeFocused();
  // Polled: it zooms in when it opens.
  await expect.poll(() => palette.boundingBox()).toMatchObject({ x: 0, y: 0, width: 375, height: 812 });
});

test("Import Markdown from the command palette adds the Note and says so", async ({ page }) => {
  await signIn(page);
  const palette = await openPalette(page);
  await palette.getByRole("option", { name: "Import Markdown" }).click();
  const dialog = page.getByRole("dialog", { name: "Import Markdown" });
  const title = `Imported probe ${Date.now()}`;
  // The dialog's file input; the file picker itself is the browser's, so set the file directly.
  await dialog.getByLabel("Choose files").setInputFiles({
    name: `${title}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(`# ${title}\n\nMade by the end-to-end test.`),
  });
  // The dialog lists it as added, and a toast says so too.
  await expect(dialog.getByRole("list", { name: "Files" }).getByRole("img", { name: "Added" })).toBeVisible();
  await expectNoViolations(page);
  await page.keyboard.press("Escape");
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

// Waits until the open Note has saved what was just typed. "Saved at" also shows before typing, so the change must
// register first. By role: Next keeps the previous page's DOM hidden for back and forward, and getByRole skips it.
async function expectSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Saved at/ })).toBeVisible();
}

// Makes a Note with this title from the command palette and waits until it is saved.
async function newNote(page: Page, title: string) {
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

// A Note carrying a new Tag, so the Tags page has a row. Leaves you on the Note.
async function noteWithTag(page: Page, title: string, tagName: string) {
  await newNote(page, title);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByPlaceholder("Find or create a Tag").fill(tagName);
  await page.getByRole("option", { name: `Create “${tagName}”` }).click();
  await expect(page.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName })).toBeVisible();
}

// Deletes a Tag from the Tags page or its own page, through the confirm.
async function deleteTag(page: Page, tagName: string) {
  await page.getByRole("button", { name: `Delete ${tagName}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete Tag" }).click();
}

// A Note with a unique title, sent to the Trash from its own screen. Leaves you on All Items.
async function trashedNote(page: Page, title: string) {
  await newNote(page, title);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
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

  const [tab] = await Promise.all([
    page.waitForEvent("popup"),
    (async () => {
      await menu.click();
      await page.getByRole("menuitem", { name: "Open in new tab" }).click();
    })(),
  ]);
  await expect(tab).toHaveURL(/\/notes\//);
  await tab.close();

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
  await deleteTag(page, tagName);
  await page.goto("/items");
  await menu.click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: folderName }).click();
  await page.getByText("Move to Trash…").click();
  await page.getByRole("button", { name: "Move Folder to Trash" }).click();
  // A top-level Folder goes back to All Items.
  await expect(page).toHaveURL(/\/items$/);
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

test("the Tags page sets a colour, renames, refuses a taken name and deletes after a confirm", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const title = `Tag colour probe ${stamp}`;
  const one = `colour-one-${stamp}`;
  const two = `colour-two-${stamp}`;
  await noteWithTag(page, title, one);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByPlaceholder("Find or create a Tag").fill(two);
  await page.getByRole("option", { name: `Create “${two}”` }).click();
  await expect(page.getByRole("list", { name: "Tags" }).getByRole("link", { name: two })).toBeVisible();

  await page.goto("/tags");
  const row = (name: string) => page.getByRole("row").filter({ hasText: name });
  await expect(row(one)).toContainText("1");

  // A picked colour shows on the pill here and on the Note, and Automatic goes back.
  await page.getByRole("button", { name: `Colour of ${one}` }).click();
  await page.getByRole("radio", { name: "teal" }).click();
  await expect(row(one).locator("[data-colour=teal]").first()).toBeVisible();
  await page.goto("/tags");
  await page.getByRole("button", { name: `Colour of ${one}` }).click();
  await expect(page.getByRole("radio", { name: "teal" })).toBeChecked();
  await page.getByRole("radio", { name: "Automatic" }).click();
  // Not "no teal on the row": the colour taken from the name can be teal too.
  await page.getByRole("button", { name: `Colour of ${one}` }).click();
  await expect(page.getByRole("radio", { name: "Automatic" })).toBeChecked();
  await page.keyboard.press("Escape");

  // A name another Tag has is refused inside the Dialog; a free one renames.
  await page.getByRole("button", { name: `Rename ${one}` }).click();
  const dialog = page.getByRole("dialog", { name: "Rename Tag" });
  await dialog.getByLabel("Name").fill(two.toUpperCase());
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog.getByRole("alert")).toContainText("already have a Tag");
  await dialog.getByLabel("Name").fill(`${one}-renamed`);
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(`${one}-renamed`)).toBeVisible();

  // Cancel keeps the Tag; the confirm deletes it from the Tag's own page and lands on the Tags page.
  await page.getByRole("button", { name: `Delete ${two}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(row(two)).toBeVisible();
  await row(two).getByRole("link", { name: two }).click();
  await expect(page.getByRole("heading", { name: two, level: 1 })).toBeVisible();
  await deleteTag(page, two);
  await expect(page).toHaveURL(/\/tags$/);
  await expect(row(two)).toHaveCount(0);

  // Tidy up.
  await page.getByRole("button", { name: `Delete ${one}-renamed` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete Tag" }).click();
  await page.goto("/items");
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
});

test("the Trash shows days left, restores, and deletes for good after a confirm", async ({ page }) => {
  await signIn(page);
  const title = `Trash probe ${Date.now()}`;
  await trashedNote(page, title);

  await page.goto("/trash");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText(/\d+ days left/);

  // Restore brings it back to All Items, and the list stays put.
  await row.getByRole("button", { name: `Restore ${title}` }).click();
  await expect(page.getByText(`Restored "${title}"`)).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.goto("/items");
  const item = page.getByRole("row").filter({ hasText: title });
  await expect(item).toBeVisible();

  // Trash it again from the row menu; Cancel keeps it, the confirm deletes it.
  await item.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await page.goto("/trash");
  await row.getByRole("button", { name: `Delete forever: ${title}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Delete forever: ${title}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByText(`Deleted "${title}" for good`)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("Empty Trash asks first, then leaves the empty state", async ({ page }) => {
  await signIn(page);
  await trashedNote(page, `Empty probe ${Date.now()}`);
  await page.goto("/trash");

  await page.getByRole("button", { name: "Empty Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("row")).not.toHaveCount(0);

  await page.getByRole("button", { name: "Empty Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Empty Trash" }).click();
  await expect(page.getByText("Trash is empty", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Empty Trash" })).toHaveCount(0);
});

test("Search highlights the match, filters by type and says when nothing matches", async ({ page }) => {
  await signIn(page);
  const word = `zq${Date.now()}`;
  const title = `Search probe ${word}`;
  await newNote(page, title);
  await page.locator(".cm-content").click();
  await page.keyboard.type(`a line about ${word} here`);
  await expectSaved(page);

  await page.goto("/search");
  await expect(page.getByText("Type something to search")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search for" }).fill(word);
  await page.getByRole("main").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`q=${word}`));
  await expect(page.getByText(`1 result for "${word}"`)).toBeVisible();
  const hit = page.getByRole("listitem").filter({ hasText: title });
  await expect(hit.locator("mark")).toHaveText(word);
  await expect(hit).toContainText("Edited");

  // An Asset-only filter finds nothing, and says so.
  await page.goto(`/search?q=${word}&type=ASSET`);
  await expect(page.getByText(`Nothing matches "${word}"`)).toBeVisible();

  // Tidy up.
  await page.goto(`/search?q=${word}`);
  await hit.getByRole("link").click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("Home shows a new Note under Recently edited and Jump back in", async ({ page }) => {
  await signIn(page);
  const title = `Home probe ${Date.now()}`;
  // Opening the Note's page records it as recently opened.
  await newNote(page, title);
  await page.goto("/");

  const edited = page.getByRole("region", { name: "Recently edited" });
  const card = edited.getByRole("link", { name: new RegExp(title) });
  await expect(card).toContainText(/Edited (just now|1 minute ago)/);
  await expect(page.getByRole("region", { name: "Jump back in" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Storage used" })).toBeVisible();
  await expectNoViolations(page);

  // Tidy up.
  await card.click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("the Note screen tags, moves, and remembers hidden Details", async ({ page }) => {
  // Many steps, and the first visit to each page compiles it on the dev server.
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const tagName = `note-probe-${stamp}`;
  const folderName = `Note folder ${stamp}`;
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(folderName);
  await page.getByRole("button", { name: "Create Folder" }).click();
  await newNote(page, `Note probe ${stamp}`);

  // + Tag creates a Tag, and the pill's × removes it.
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByPlaceholder("Find or create a Tag").fill(tagName);
  await page.getByRole("option", { name: `Create “${tagName}”` }).click();
  const tags = page.getByRole("list", { name: "Tags" });
  await expect(tags.getByRole("link", { name: tagName })).toBeVisible();
  await tags.getByRole("button", { name: `Remove the Tag ${tagName}` }).click();
  await expect(tags.getByRole("link", { name: tagName })).toHaveCount(0);

  // The Details Folder select moves the Note; the breadcrumb follows.
  const details = page.getByRole("complementary", { name: "Details" });
  await details.getByLabel("Folder").selectOption({ label: folderName });
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: folderName })).toBeVisible();
  await expect(details.getByText("Words")).toBeVisible();

  // Hiding Details is remembered.
  await page.getByRole("button", { name: "Details" }).click();
  await expect(details).toBeHidden();
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Details" })).toBeHidden();
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("complementary", { name: "Details" })).toBeVisible();

  // Tidy up: the Note, the Folder and the Tag.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.getByRole("main").getByRole("link", { name: folderName }).click();
  await page.getByText("Move to Trash…").click();
  await page.getByRole("button", { name: "Move Folder to Trash" }).click();
  await page.goto("/tags");
  await page.getByRole("main").getByRole("link", { name: tagName }).click();
  await deleteTag(page, tagName);
});

test("hovering a Link previews its target", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const target = `Preview target ${stamp}`;
  await newNote(page, target);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.type("The first line of the target.");
  await expectSaved(page);

  await newNote(page, `Preview source ${stamp}`);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.type(`See [[Preview target ${stamp}`);
  await page.getByRole("option", { name: new RegExp(target) }).click();
  // Off the Link's line, it shows as a link.
  await page.keyboard.press("Enter");
  await page.keyboard.type("Next line.");
  const link = page.locator(".cm-wikilink", { hasText: target });
  await link.hover();
  const card = page.locator("[data-link-preview]").filter({ hasText: target });
  await expect(card).toContainText("The first line of the target.");
  await expect(card).toContainText("Note · Top level");
  // Screen readers hear it through a live region that is always there.
  await expect(page.locator("p[aria-live=polite]").filter({ hasText: `Link to Note ${target}` })).toContainText(
    "The first line of the target.",
  );
  await expectNoViolations(page);

  // From the keyboard: the caret inside the Link shows it too, and Escape hides it.
  await page.mouse.move(0, 0);
  await expect(card).toHaveCount(0);
  await page.keyboard.press("ArrowUp");
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);

  // Tidy up both Notes.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.goto("/items");
  const row = page.getByRole("row").filter({ hasText: target });
  await row.getByRole("button", { name: `Actions for ${target}` }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(row).toHaveCount(0);
});

test("on a phone the Note's Details open as a bottom Sheet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await newNote(page, `Phone note ${Date.now()}`);
  await expect(page.getByRole("complementary", { name: "Details" })).toBeHidden();
  await page.getByRole("button", { name: "Details" }).click();
  const sheet = page.getByRole("dialog", { name: "Details" });
  await expect(sheet.getByText("Words")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

// A 1×1 PNG.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("dropping files anywhere in the Knowledge Base shows the overlay and uploads them", async ({ page }) => {
  await signIn(page);
  await page.goto("/items");
  const name = `Dropped probe ${Date.now()}`;
  const files = await page.evaluateHandle((n) => {
    const data = new DataTransfer();
    data.items.add(new File([`# ${n}`], `${n}.md`, { type: "text/markdown" }));
    return data;
  }, name);
  await page.dispatchEvent("main", "dragenter", { dataTransfer: files });
  await expect(page.getByText("Drop to add to the top level")).toBeVisible();
  await page.dispatchEvent("main", "drop", { dataTransfer: files });
  await expect(page.getByText("Drop to add to the top level")).toBeHidden();
  const dialog = page.getByRole("dialog", { name: "Upload files" });
  await expect(dialog.getByRole("link", { name })).toBeVisible();

  // Tidy up.
  await dialog.getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("an uploaded image opens on the Asset screen, edits in place and downloads", async ({ page }) => {
  await signIn(page);
  await page.goto("/items");
  // The header's button; an empty list shows a second one.
  await page.getByRole("button", { name: "Upload", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload files" });
  const name = `pixel-${Date.now()}.png`;
  await dialog.getByLabel("Choose files").setInputFiles({ name, mimeType: "image/png", buffer: PIXEL });
  await dialog.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/assets\//);

  await expect(page.getByRole("img", { name })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute("download", "");
  const details = page.getByRole("complementary", { name: "Details" });
  await expect(details.getByText("PNG image")).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoViolations(page);
  }

  // The title edits in place; the breadcrumb follows once it is saved. Typing on in the description while that
  // save refreshes the page keeps both the focus and the text.
  const renamed = `Renamed ${name}`;
  await details.getByLabel("Title").fill(renamed);
  await details.getByLabel("Title").press("Tab");
  await page.keyboard.type("A single pixel");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText(renamed)).toBeVisible();
  await page.keyboard.type(", for testing.");
  await expect(details.getByLabel("Description")).toBeFocused();
  await expect(details.getByLabel("Description")).toHaveValue("A single pixel, for testing.");

  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});
