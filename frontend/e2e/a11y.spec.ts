import { expect, test } from "@playwright/test";

import { MCP_TOOLS } from "../lib/mcp-tools";

import {
  PIXEL,
  chooseFolder,
  deleteTag,
  email,
  expectNoViolations,
  expectSaved,
  newNote,
  noteWithTag,
  openPalette,
  password,
  signIn,
  trashFolder,
  trashedNote,
} from "./helpers";

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
      // The title is the body's first line, and a click in the middle of the editor lands on it.
      await page.keyboard.press("Control+End");
      await page.keyboard.type(`about ${word}`);
      await expectSaved(page);

      await page.goto(`/search?q=${word}`);
      await expect(page.locator("main mark").first()).toBeVisible();
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

    test("the Admin tabs and the revoke confirm have no WCAG 2.2 AA violations", async ({ page }) => {
      await signIn(page);
      const invited = `axe-${Date.now()}@example.com`;
      for (const [path, heading] of [
        ["/admin/overview", "Where the storage goes"],
        ["/admin/users", "Users"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Admin" }).locator("[aria-current=page]")).toBeVisible();
        if (path === "/admin/overview") await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        await expectNoViolations(page);
      }

      await page.goto("/admin");
      await page.getByLabel("Email to invite").fill(invited);
      await page.getByRole("button", { name: "Create Invite" }).click();
      const row = page.getByRole("row").filter({ hasText: invited });
      await expect(row).toContainText("Pending");
      await expectNoViolations(page);
      await row.getByRole("button", { name: `Revoke the Invite for ${invited}` }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectNoViolations(page);
      await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
      await expect(row).toContainText("Revoked");
    });

    test("the sign-in and system pages have no WCAG 2.2 AA violations", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in to CoreEx", level: 1 })).toBeVisible();
      await expectNoViolations(page);

      await signIn(page);
      for (const [path, heading] of [
        ["/reset-password", "Choose a new password"],
        ["/invite-only", "CoreEx is invite-only"],
        ["/disabled", "Your account is disabled"],
        ["/notes/00000000-0000-0000-0000-000000000000", "Page not found"],
        ["/notes/not-a-uuid", "Page not found"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
        await expectNoViolations(page);
      }
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
  await page.goto("/items");
  await expect(page.getByRole("heading", { name: "Knowledge Base", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Show the Knowledge Base panel" }).click();
  await expect(page.getByRole("dialog", { name: "Knowledge Base" }).getByRole("radio", { name: "Folders" })).toBeVisible();
});

test("the account menu opens from the keyboard and closes on Escape", async ({ page }) => {
  await signIn(page);
  const account = page.getByRole("button", { name: /^Account/ });
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

test("an Item's row menu moves, tags, trashes and undoes", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const title = `List probe ${stamp}`;
  const folderName = `Probe folder ${stamp}`;
  const tagName = `probe-${stamp}`;
  await newNote(page, title);

  // A Folder to move into, from the panel (a Note opens it on its Notes tab).
  await page.getByRole("radio", { name: "Folders" }).click();
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
  await chooseFolder(page, move, "Folder", folderName);
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
  await trashFolder(page, folderName);
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
  // The title is the body's first line, and a click in the middle of the editor lands on it.
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`a line about ${word} here`);
  await expectSaved(page);

  await page.goto("/search");
  await expect(page.getByText("Type something to search")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search for" }).fill(word);
  await page.getByRole("main").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`q=${word}`));
  await expect(page.getByText(`1 result for "${word}"`)).toBeVisible();
  const hit = page.getByRole("listitem").filter({ hasText: title });
  // The word is in the heading line and in the line below it.
  await expect(hit.locator("mark")).toHaveText([word, word]);
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

test("a long Tag name keeps the Search filters inside the window", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const tagName = `long-filter-tag-${stamp}-keeps-going`;
  await noteWithTag(page, `Filter probe ${stamp}`, tagName);
  const note = page.url();

  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/search");
    const box = (await page.getByRole("combobox", { name: "Tag" }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }

  // Tidy up.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(note);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.goto("/tags");
  await deleteTag(page, tagName);
});

test("an Invite is created, its link copied, and revoked after a confirm", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const invited = `invite-${Date.now()}@example.com`;
  await page.goto("/admin");
  await page.getByLabel("Email to invite").fill(invited);
  await page.getByRole("button", { name: "Create Invite" }).click();

  const row = page.getByRole("row").filter({ hasText: invited });
  await expect(row).toContainText("Pending");
  await row.getByRole("button", { name: `Copy sign-up link for ${invited}` }).click();
  await expect(page.getByText(`Copied the sign-up link for ${invited}`)).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain(`/login?email=${encodeURIComponent(invited)}`);

  // Cancel keeps it pending; the confirm revokes it, and a revoked Invite has no actions.
  await row.getByRole("button", { name: `Revoke the Invite for ${invited}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("Pending");
  await row.getByRole("button", { name: `Revoke the Invite for ${invited}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(row).toContainText("Revoked");
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("the MCP guide shows this server's address and the tools, and a command can be copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);

  // It opens from the Account menu, and has no Knowledge Base panel beside it.
  await page.getByRole("button", { name: /^Account/ }).click();
  await page.getByRole("menuitem", { name: "Connect an Agent" }).click();
  await expect(page).toHaveURL(/\/help\/mcp$/);
  await expect(page.getByRole("heading", { level: 1, name: "Connect an Agent" })).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  for (const name of ["What an Agent can do", "Connect your tool", "Tools", "Access tokens and safety", "Limits", "Troubleshooting"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }

  // The address is this installation's own, and every command uses a placeholder, never a real token.
  const address = page.getByRole("group", { name: "CoreEx server address" });
  await expect(address).toContainText("/mcp");
  await address.getByRole("button", { name: "Copy CoreEx server address" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https?:\/\/.+\/mcp$/);
  await expect(page.getByRole("group", { name: "Claude Code command" })).toContainText("Bearer cx_pat_YOUR_TOKEN");
  expect(await page.getByRole("main").innerText()).not.toMatch(/cx_pat_(?!YOUR_TOKEN)/);

  // Every tool is listed, and the page's own links work.
  await expect(page.locator("#tools dt")).toHaveCount(MCP_TOOLS.length);
  await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Troubleshooting" }).click();
  await expect(page).toHaveURL(/#troubleshooting$/);
  await page.getByText("429 RATE_LIMITED").click();
  await expect(page.getByText("more than 60 calls in a minute")).toBeVisible();
  await expectNoViolations(page);

  // And from the Access tokens page.
  await page.goto("/settings/tokens");
  await page.getByRole("link", { name: "How to connect an Agent" }).click();
  await expect(page).toHaveURL(/\/help\/mcp$/);
});

test("an Access token is created, its secret shown once, and revoked after a confirm", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const name = `agent-${Date.now()}`;
  await page.goto("/settings/tokens");
  await expect(page.getByRole("heading", { name: "Access tokens" })).toBeVisible();
  // Settings is not the Knowledge Base, so it has no panel beside the page.
  await expect(page.getByRole("complementary")).toHaveCount(0);

  await page.getByRole("button", { name: "New Access token" }).click();
  const dialog = page.getByRole("dialog", { name: "New Access token" });
  await dialog.getByLabel("Name").fill(name);
  await expectNoViolations(page);
  await dialog.getByRole("button", { name: "Create token" }).click();

  // The secret is in the dialog now, and only now.
  const secret = page.getByRole("dialog", { name: "Copy your Access token" }).getByLabel("Access token");
  await expect(secret).toHaveValue(/^cx_pat_/);
  await page.getByRole("button", { name: "Copy token" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^cx_pat_/);
  await page.getByRole("button", { name: "Done" }).click();

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Never used");
  await expect(page.getByText(/cx_pat_/)).toHaveCount(0);
  await expectNoViolations(page);

  await row.getByRole("button", { name: `Revoke ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Revoke ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(row).toHaveCount(0);
});

test("an Agent's edit is named in the Details panel until you edit the Note yourself", async ({ page }) => {
  await signIn(page);
  const name = `agent-${Date.now()}`;
  await page.goto("/settings/tokens");
  await page.getByRole("button", { name: "New Access token" }).click();
  await page.getByRole("dialog", { name: "New Access token" }).getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create token" }).click();
  const secret = await page.getByRole("dialog", { name: "Copy your Access token" }).getByLabel("Access token").inputValue();
  await page.getByRole("button", { name: "Done" }).click();

  // The Agent writes a Note over MCP, the way Claude Code would.
  const title = `Agent note ${Date.now()}`;
  const api = process.env.API_URL ?? "http://localhost:8080";
  const response = await page.request.post(`${api}/mcp`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "create_note", arguments: { title, markdown: `# ${title}\nWritten by an Agent` } },
    },
  });
  expect(response.ok()).toBeTruthy();
  const created = JSON.parse((await response.json()).result.content[0].text) as { id: string };

  await page.goto(`/notes/${created.id}`);
  const details = page.getByRole("complementary", { name: "Details" });
  await expect(details.getByText("Edited by")).toBeVisible();
  await expect(details.getByText(name)).toBeVisible();

  // Typing in the editor is the User's own change: the next save clears the name.
  await page.getByRole("textbox").last().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" and then me");
  await expectSaved(page);
  await expect(details.getByText("Edited by")).toHaveCount(0);

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.goto("/settings/tokens");
  await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: `Revoke ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
});

test("the Users table shows you without Disable or Remove, and Overview has its chart", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/users");
  const me = page.getByRole("row").filter({ hasText: email });
  await expect(me).toContainText("You");
  await expect(me).toContainText("Admin");
  await expect(me.getByRole("button", { name: /^(Disable|Enable|Remove) / })).toHaveCount(0);

  await page.goto("/admin/overview");
  await expect(page.getByRole("img", { name: /used, split by User/ })).toBeVisible();
  await expect(page.getByText("Hosting limit")).toBeVisible();
});

test("an Admin disables, enables and removes another User", async ({ page, browser }) => {
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const other = `other-${stamp}@example.com`;
  await page.goto("/admin");
  await page.getByLabel("Email to invite").fill(other);
  await page.getByRole("button", { name: "Create Invite" }).click();
  await expect(page.getByRole("row").filter({ hasText: other })).toContainText("Pending");

  // The invited person signs up in their own browser.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${page.url().split("/admin")[0]}/login?email=${encodeURIComponent(other)}`);
  await guestPage.getByLabel("Password").fill("coreex-e2e-password");
  await guestPage.getByRole("button", { name: "Create account" }).click();
  await expect(guestPage.getByRole("navigation", { name: "Main" }).or(guestPage.getByRole("button", { name: "Open the menu" }))).toBeVisible();
  await guest.close();

  await page.goto("/admin/users");
  const row = page.getByRole("row").filter({ hasText: other });
  await expect(row).toContainText("Active");

  await row.getByRole("button", { name: `Disable ${other}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText(`Disabled ${other}`)).toBeVisible();
  await expect(row).toContainText("Disabled");

  await row.getByRole("button", { name: `Enable ${other}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enable" }).click();
  await expect(row).toContainText("Active");

  // A custom quota shows, and goes back to the default.
  await row.getByLabel(`Quota in megabytes for ${other}`).fill("7");
  await row.getByRole("button", { name: `Save the quota for ${other}` }).click();
  await expect(row).toContainText("Custom quota");
  await row.getByRole("button", { name: `Use the default quota for ${other}` }).click();
  await expect(row).toContainText("Default quota");
  await expect(row.getByLabel(`Quota in megabytes for ${other}`)).not.toHaveValue("7");

  await row.getByRole("button", { name: `Remove ${other}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove for good" }).click();
  await expect(page.getByText(`Removed ${other}`)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("on a phone the sign-in card fits, and Enter signs in rather than sending a reset link", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  const card = page.getByRole("main");
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Password").press("Enter");
  await expect(page.getByRole("button", { name: "Open the menu" })).toBeVisible();
});

test("a Folder is renamed, given a subfolder, moved, and sent to the Trash from its page", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const name = `fa${stamp}`;
  const renamed = `fb${stamp}`;
  const child = `fc${stamp}`;
  await page.goto("/items");
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("button", { name: "Create Folder" }).click();
  await page.goto("/items");
  await page.getByRole("main").getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: `Rename ${name}` }).click();
  await page.getByRole("dialog", { name: "Rename Folder" }).getByLabel("Name").fill(renamed);
  await page.getByRole("dialog", { name: "Rename Folder" }).getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { name: renamed, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: `New subfolder in ${renamed}` }).click();
  await page.getByRole("dialog", { name: "New subfolder" }).getByLabel("Name").fill(child);
  await page.getByRole("dialog", { name: "New subfolder" }).getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: child })).toBeVisible();

  // A Folder cannot go into its own subfolder, so the Move dialog does not offer it.
  await page.getByRole("button", { name: `Move ${renamed}`, exact: true }).click();
  const move = page.getByRole("dialog", { name: "Move Folder" });
  await move.getByRole("combobox", { name: "Move into" }).click();
  await expect(page.getByRole("option", { name: "Top level" })).toBeVisible();
  await expect(page.getByRole("option", { name: child })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(move).toBeHidden();

  await trashFolder(page, renamed);
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

test("Home truncates a long title inside its Recently edited card, and other lists keep it on screen", async ({ page }) => {
  await signIn(page);
  const word = `overflow${Date.now()}`;
  const title = `Home ${word} ${"a-very-long-unbroken-title-".repeat(6)}end`;
  await newNote(page, title);
  const sizes = [{ width: 1280, height: 800 }, { width: 375, height: 812 }];
  // The truncated title (it carries the full one as a tooltip) ends inside the window.
  const onScreen = async (url: string) => {
    await page.goto(url);
    const name = page.locator("main").getByTitle(title);
    const b = (await name.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  };

  for (const size of sizes) {
    await page.setViewportSize(size);
    await onScreen(`/search?q=${word}`);
    await onScreen("/items");
    await page.goto("/");
    const card = page.getByRole("region", { name: "Recently edited" }).getByRole("link", { name: new RegExp(title) });
    const name = card.locator("span.truncate").first();
    await expect(name).toHaveAttribute("title", title);
    // The title is cut with an ellipsis, and nothing in the card reaches past its right edge.
    const box = (await card.boundingBox())!;
    for (const part of [name, card.locator("span").last()]) {
      const b = (await part.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
    }
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  }

  await page.getByRole("region", { name: "Recently edited" }).getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await onScreen("/trash");
  }
});

test("the Note screen tags, moves, and remembers hidden Details", async ({ page }) => {
  // Many steps, and the first visit to each page compiles it on the dev server.
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const tagName = `note-probe-${stamp}`;
  const folderName = `Note folder ${stamp}`;
  await page.goto("/items");
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
  await chooseFolder(page, details, "Folder", folderName);
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
  await trashFolder(page, folderName);
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
  await page.keyboard.press("Control+End");
  await page.keyboard.type("The first line of the target.");
  await expectSaved(page);

  await newNote(page, `Preview source ${stamp}`);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
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

  // Labels sit apart from their fields, and the pencils mark what can be edited.
  const labelBox = await details.getByText("Title", { exact: true }).boundingBox();
  const fieldBox = await details.getByLabel("Title").boundingBox();
  expect(fieldBox!.y - (labelBox!.y + labelBox!.height)).toBeGreaterThanOrEqual(4);
  await expect(details.locator("svg.lucide-pencil")).toHaveCount(2);
  // Dividers separate the details, the organization (Folder, Tags, Backlinks) and the Info block: each section but the
  // last has a line under it.
  const dividers = await details.evaluate((aside) =>
    [...aside.firstElementChild!.children].slice(0, -1).map((el) => getComputedStyle(el).borderBottomWidth),
  );
  expect(dividers).toEqual(["1px", "1px"]);
  // The Folder choice is the site's own listbox, not the browser's.
  await details.getByRole("combobox", { name: "Folder" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: "Top level" })).toBeVisible();
  await page.keyboard.press("Escape");

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

test("the rail shows its labels, collapses to icons and remembers the choice", async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole("navigation", { name: "Main" });
  for (const label of ["Home", "Knowledge Base", "Assets", "Trash"]) {
    await expect(rail.getByRole("link", { name: label }).getByText(label, { exact: true })).toBeVisible();
  }
  await expectNoViolations(page);

  await rail.getByRole("button", { name: "Collapse the menu" }).click();
  await expect(rail.getByText("Knowledge Base", { exact: true })).toBeHidden();
  await expect(rail.getByRole("link", { name: "Knowledge Base" })).toBeVisible();
  await expectNoViolations(page);

  // The cookie is read on the server, so the choice is there from the first paint.
  await page.reload();
  await expect(rail.getByRole("button", { name: "Expand the menu" })).toBeVisible();
  await expect(rail.getByText("Knowledge Base", { exact: true })).toBeHidden();
  await rail.getByRole("button", { name: "Expand the menu" }).click();
  await expect(rail.getByText("Knowledge Base", { exact: true })).toBeVisible();
});

test("the Assets page lists Assets only, with no Knowledge Base panel", async ({ page }) => {
  await signIn(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Assets" }).click();
  await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Knowledge Base" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Note" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import" })).toHaveCount(0);

  await page.getByRole("button", { name: "Upload", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload files" });
  const name = `asset-page-${Date.now()}.png`;
  await dialog.getByLabel("Choose files").setInputFiles({ name, mimeType: "image/png", buffer: PIXEL });
  await dialog.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/assets\//);
  // An Asset belongs to the Assets module, so its breadcrumb starts there.
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Assets" })).toBeVisible();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Assets" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();

  await page.getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("the Knowledge Base panel shows on Knowledge Base pages only", async ({ page }) => {
  await signIn(page);
  const panel = page.getByRole("complementary", { name: "Knowledge Base" });
  for (const path of ["/", "/trash", "/assets"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(panel).toHaveCount(0);
  }
  await page.goto("/items");
  await expect(panel).toBeVisible();
});

test("the panel has Notes, Folders and Tags tabs, a plus that follows them, and a filter", async ({ page }) => {
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const title = `panelnote${stamp}`;
  const tagName = `paneltag${stamp}`;
  await page.goto("/items");
  const panel = page.getByRole("complementary", { name: "Knowledge Base" });
  for (const tab of ["Notes", "Folders", "Tags"]) await expect(panel.getByRole("radio", { name: tab })).toBeVisible();

  // The plus button is New Folder on Folders, New Tag on Tags and New Note on Notes.
  await expect(panel.getByRole("button", { name: "New Folder" })).toBeVisible();
  await panel.getByRole("radio", { name: "Tags" }).click();
  await expect(panel.getByRole("button", { name: "New Folder" })).toHaveCount(0);
  await panel.getByRole("button", { name: "New Tag" }).click();
  await page.getByLabel("Tag name").fill(tagName);
  await page.getByRole("button", { name: "Create Tag" }).click();
  await expect(panel.getByRole("link", { name: tagName })).toBeVisible();
  // The same name again is refused and the form stays open.
  await panel.getByRole("button", { name: "New Tag" }).click();
  await page.getByLabel("Tag name").fill(tagName.toUpperCase());
  await page.getByRole("button", { name: "Create Tag" }).click();
  await expect(page.getByText("You already have a Tag with this name.")).toBeVisible();
  await page.keyboard.press("Escape");

  // The filter narrows the list in place; Ctrl+K stays the palette's.
  await panel.getByRole("searchbox", { name: "Filter tags" }).fill(`nothing${stamp}`);
  await expect(panel.getByText("No Tags match.")).toBeVisible();
  await panel.getByRole("searchbox", { name: "Filter tags" }).fill(tagName.toUpperCase());
  await expect(panel.getByRole("link", { name: tagName })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);

  await panel.getByRole("radio", { name: "Notes" }).click();
  await expect(panel.getByRole("button", { name: "New Note" })).toBeVisible();
  await newNote(page, title);
  const notes = page.getByRole("complementary", { name: "Knowledge Base" });
  await notes.getByRole("searchbox", { name: "Filter notes" }).fill(title);
  await expect(notes.getByRole("link", { name: title })).toBeVisible();
  // The search is fuzzy (trigrams), so a string that shares digits with the title would still find it.
  await notes.getByRole("searchbox", { name: "Filter notes" }).fill("qqzzxxjj");
  await expect(notes.getByText("No Notes match.")).toBeVisible();
  await expectNoViolations(page);

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.goto("/tags");
  await deleteTag(page, tagName);
});

test("the Items open as a grid, the view is chosen and remembered, and a section folds", async ({ page }) => {
  test.slow();
  await signIn(page);
  const title = `gridnote${Date.now()}`;
  await newNote(page, title);

  // With no choice made yet, the Items are a grid of cards.
  await page.context().clearCookies({ name: "view" });
  await page.goto("/items");
  const view = page.getByRole("radiogroup", { name: "View" });
  await expect(view.getByRole("radio", { name: "Grid" })).toBeChecked();
  const cards = page.getByRole("list", { name: "Items, most recently updated first" });
  await expect(cards.getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expectNoViolations(page);

  // The list is a table, and the choice survives a reload.
  await view.getByRole("radio", { name: "List" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.reload();
  await expect(view.getByRole("radio", { name: "List" })).toBeChecked();
  await expect(page.getByRole("table")).toBeVisible();
  await expectNoViolations(page);

  // The Items section folds away and stays folded after a reload.
  const heading = page.getByRole("button", { name: /^Items \(\d+\)$/ });
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  await heading.click();
  await expect(page.getByRole("table")).toBeHidden();
  await page.reload();
  await expect(heading).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("table")).toBeHidden();
  await heading.click();
  await expect(page.getByRole("table")).toBeVisible();

  // A card has the same menu as a row, and Move to Trash works from it.
  await view.getByRole("radio", { name: "Grid" }).click();
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByText(`Moved "${title}" to the Trash`)).toBeVisible();
  await expect(cards.getByRole("link", { name: title })).toHaveCount(0);
});

test("the editor toolbar formats text, shows where the caret is, and moves with the arrow keys", async ({ page }) => {
  test.slow();
  await signIn(page);
  await newNote(page, `toolbar${Date.now()}`);
  const body = page.getByRole("textbox", { name: "Note content" });
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("plain");
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  const bold = toolbar.getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");

  // A button wraps the selected words, and the same button (or Ctrl+B) takes it off again.
  await page.keyboard.press("Shift+Home");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(body).toBeFocused();
  await page.keyboard.press("Control+b");
  await expect(bold).toHaveAttribute("aria-pressed", "false");

  // Lists and headings follow the caret too.
  await toolbar.getByRole("button", { name: "Bulleted list" }).click();
  await expect(toolbar.getByRole("button", { name: "Bulleted list" })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Bulleted list" }).click();
  await toolbar.getByRole("button", { name: "Heading" }).click();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect(toolbar.getByRole("button", { name: "Heading" })).toHaveAttribute("aria-pressed", "true");
  await expectSaved(page);

  // Arrow keys move between the buttons.
  await toolbar.getByRole("button", { name: "Heading" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(bold).toBeFocused();

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoViolations(page);
  }

  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("a Note's first-line heading and its title stay in step, both ways", async ({ page }) => {
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const title = `step${stamp}`;
  await newNote(page, title);
  const titleField = page.getByRole("textbox", { name: "Title" });
  const lines = page.locator(".cm-line");
  const body = page.getByRole("textbox", { name: "Note content" });

  // The title typed in its field is the first line, as a heading.
  await expect(lines.first()).toContainText(title);

  // Typing in that heading changes the title.
  await body.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect(titleField).toHaveValue(`${title} edited`);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText(`${title} edited`)).toBeVisible();
  await expectSaved(page);

  // Changing the title rewrites the heading, and the saved Note has no conflict after a reload.
  await titleField.fill(`renamed${stamp}`);
  await expect(lines.first()).toContainText(`renamed${stamp}`);
  await expectSaved(page);
  await page.reload();
  await expect(titleField).toHaveValue(`renamed${stamp}`);
  await expect(page.getByText("changed somewhere else")).toHaveCount(0);

  // A Note that starts with plain text gets its heading put in front when it is titled, and keeps its text.
  await newNote(page, `plain${stamp}`);
  await page.getByRole("textbox", { name: "Title" }).fill("");
  await expectSaved(page);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Just text");
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("");
  await page.getByRole("textbox", { name: "Title" }).fill(`named${stamp}`);
  await expect(page.locator(".cm-line").first()).toContainText(`named${stamp}`);
  await expect(page.locator(".cm-line").nth(1)).toContainText("Just text");
  await expectSaved(page);

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.getByRole("button", { name: /^Actions for renamed/ }).first().click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
});

test("a Folder opens as a Graph, its Items reached by keyboard and listed as a table", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const target = `Graph target ${stamp}`;
  const source = `Graph source ${stamp}`;
  await newNote(page, target);
  await newNote(page, source);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`See [[${target}`);
  await page.getByRole("option", { name: new RegExp(target) }).click();
  await page.keyboard.press("Enter");
  await expectSaved(page);

  // All Items switches to its Graph, where each Item is a named link.
  await page.goto("/items");
  await page.getByRole("radio", { name: "Graph" }).click();
  await expect(page).toHaveURL(/\/graph$/);
  const sourceNode = page.getByRole("link", { name: `${source}, Note, links to 1: ${target}, linked from 0` });
  await expect(sourceNode).toBeVisible();
  await expectNoViolations(page);

  // Tab reaches a node; an arrow key follows its Link; Enter opens the Item.
  await sourceNode.focus();
  const targetNode = page.getByRole("link", { name: new RegExp(`^${target}, Note`) });
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
    if (await targetNode.evaluate((el) => el === document.activeElement)) break;
    await sourceNode.focus();
    await page.keyboard.press(key);
  }
  await expect(targetNode).toBeFocused();

  // The same graph as a table.
  await page.getByRole("button", { name: "Show as table" }).click();
  await expect(page.getByRole("row", { name: `${source} Note ${target} None` })).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Show as graph" }).click();
  await targetNode.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(target);

  // Tidy up both Notes.
  await page.goto("/items");
  for (const title of [source, target]) {
    const item = page.getByRole("row").filter({ hasText: title });
    await item.getByRole("button", { name: `Actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    await expect(item).toHaveCount(0);
  }
});

test("a dragged Graph node stays where it was dropped, until Reset layout", async ({ page }) => {
  await signIn(page);
  const title = `Layout node ${Date.now()}`;
  await newNote(page, title);
  // At rest from the start: a node still settling would drift out from under the pointer.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/graph");
  const node = page.getByRole("link", { name: new RegExp(`^${title}, Note`) });
  // The dot itself: the node's own box also holds its label.
  const box = (await node.locator("circle").boundingBox())!;

  // Saving answers a server-action POST; wait for it before reloading.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/graph"));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 60, { steps: 5 });
  await page.mouse.up();
  await saved;
  // Where the node sits, rounded: the saved number loses its last digits on the way through the database.
  const at = async () => ((await node.getAttribute("transform")) ?? "").match(/-?[\d.]+/g)!.map((n) => Math.round(Number(n)));
  const dropped = await at();

  await page.reload();
  await expect.poll(at).toEqual(dropped);

  const reset = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/graph"));
  await page.getByRole("button", { name: "Reset layout" }).click();
  await reset;
  await page.reload();
  await expect.poll(at).not.toEqual(dropped);

  // Tidy up.
  await node.locator("circle").click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("Graph labels fade in with zoom, and the graph settles live unless motion is reduced", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const titles = [`Fade a ${stamp}`, `Fade b ${stamp}`, `Fade c ${stamp}`];
  for (const title of titles) await newNote(page, title);

  await page.goto("/graph");
  const nodes = page.locator("svg[role=group] g[role=link]");
  const node = page.getByRole("link", { name: new RegExp(`^${titles[0]}, Note`) });
  await expect(node).toBeVisible();

  // It settles while you watch: some node moves in the seconds after it opens.
  const where = () => nodes.evaluateAll((els) => els.map((el) => el.getAttribute("transform")).join("|"));
  const opened = await where();
  await expect.poll(where, { timeout: 8000 }).not.toBe(opened);

  // A label is hidden zoomed out, shown zoomed in, and shown at any zoom while its node is focused.
  const label = node.locator("text");
  for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(label).toHaveCount(0);
  await node.focus();
  await expect(label).toHaveCSS("opacity", "1");
  await node.blur();
  await expect(label).toHaveCount(0);
  for (let i = 0; i < 14; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(label).toHaveCSS("opacity", "1");

  // Dimming and the Mint Links animate with the motion tokens.
  const transition = () => node.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(await transition()).toBe("0.2s");

  // With reduced motion the layout is already at rest and nothing animates.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(node).toBeVisible();
  const still = await where();
  // Two frames: a graph that was settling would have moved by then.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  expect(await where()).toBe(still);
  expect(parseFloat(await transition())).toBeLessThan(0.001);

  // Tidy up.
  await page.goto("/items");
  for (const title of titles) {
    const item = page.getByRole("row").filter({ hasText: title });
    await item.getByRole("button", { name: `Actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    await expect(item).toHaveCount(0);
  }
});

test("a Note's Connections show its Links as a small graph and a list, kept current as you type", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const target = `Connect target ${stamp}`;
  const source = `Connect source ${stamp}`;
  await newNote(page, target);
  const connections = page.getByRole("region", { name: "Connections" });
  await expect(connections.getByText("No Links yet. Type [[ in the Note to link it.")).toBeVisible();

  // A Link typed in the Note shows up in its Connections without a reload.
  await newNote(page, source);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`See [[${target}`);
  await page.getByRole("option", { name: new RegExp(target) }).click();
  await page.keyboard.press("Enter");
  await expectSaved(page);
  await expect(connections.getByRole("list", { name: "Links to" }).getByRole("link", { name: target })).toBeVisible();
  const targetNode = connections.getByRole("link", { name: new RegExp(`^${target}, Note`) });
  await expect(targetNode).toBeVisible();
  await expect(connections.getByRole("link", { name: "Open in Graph" })).toHaveAttribute("href", "/graph");
  await expectNoViolations(page);
  await connections.getByRole("link", { name: "2 Links away" }).click();
  await expect(page).toHaveURL(/depth=2/);
  await expect(connections.getByRole("link", { name: "2 Links away" })).toHaveAttribute("aria-current", "true");

  // A node opens its Item, whose Connections show the Note linking to it.
  await targetNode.locator("circle").last().click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(target);
  await expect(connections.getByRole("link", { name: new RegExp(`^${source}, Note, links to 1`) })).toBeVisible();

  // Tidy up both Notes.
  await page.goto("/items");
  for (const title of [source, target]) {
    const item = page.getByRole("row").filter({ hasText: title });
    await item.getByRole("button", { name: `Actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    await expect(item).toHaveCount(0);
  }
});

test("the Graph goes full screen, refits, and the button returns", async ({ page }) => {
  await signIn(page);
  await newNote(page, `Full screen ${Date.now()}`);
  await page.goto("/graph");
  const canvas = page.getByRole("group", { name: /graph/i }).first();
  await expect(canvas).toBeVisible();
  const before = (await canvas.boundingBox())!;

  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(before.height);
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
