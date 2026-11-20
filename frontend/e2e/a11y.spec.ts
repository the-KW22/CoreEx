import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { MCP_TOOLS } from "../lib/mcp-tools";

import {
  PIXEL,
  chooseFolder,
  deleteTag,
  email,
  expectNoViolations,
  expectSaved,
  newApplication,
  newNote,
  noteWithTag,
  openPalette,
  password,
  signIn,
  trashFolder,
  trashRows,
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
      await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
      await page.getByRole("button", { name: `Move Tag probe ${stamp} to the Trash` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
      await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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

test("on a tablet the Knowledge Base panel is in the rail, and a collapsed rail opens it in a Sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await page.goto("/items");
  await expect(page.getByRole("complementary", { name: "Knowledge Base" }).getByRole("radio", { name: "Folders" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
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
  // While it animates shut it still looks open, and openPalette would take it for an open one.
  await expect(palette).toBeHidden();

  // Tidy up: the probe Note goes to the Trash.
  await openPalette(page);
  await search.fill(title);
  await palette.getByRole("option", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).not.toHaveURL(/\/notes\//);
});

test("the rail tells Quick find (Ctrl+K) from Search, above Trash", async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole("navigation", { name: "Main" });
  const quick = rail.getByRole("button", { name: "Quick find" });
  const search = rail.getByRole("link", { name: "Search", exact: true });
  const trash = rail.getByRole("link", { name: "Trash" });
  await expect(quick).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K");
  const [q, s, t] = await Promise.all([quick, search, trash].map((entry) => entry.boundingBox()));
  expect(q!.y).toBeLessThan(s!.y);
  expect(s!.y).toBeLessThan(t!.y);

  // Quick find is the palette, which matches titles and says so; its last row is the way to the Search page.
  await quick.click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("zq9xnothing");
  await expect(palette.getByText(/No titles match/)).toBeVisible();
  await expect(palette.getByRole("option", { name: /Search all text for/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  // Search is the page, and the only entry that shows as current there.
  await search.click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(search).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("link", { name: "Knowledge Base" })).not.toHaveAttribute("aria-current", "page");

  // Collapsed, both stay (icons with names).
  await page.keyboard.press("Control+\\");
  await expect(rail.getByRole("button", { name: "Quick find" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Search", exact: true })).toBeVisible();
});

test("the phone menu has Search, and Quick find is the icon in the header", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.getByRole("button", { name: "Open the menu" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("button", { name: "Quick find" })).toHaveCount(0);
  await menu.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
});

test("on a phone the Quick find icon opens a full-screen palette", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.getByRole("banner").getByRole("button", { name: "Quick find", exact: true }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  const moveButton = row.getByRole("button", { name: `Move ${title} to a Folder` });
  const trashButton = row.getByRole("button", { name: `Move ${title} to the Trash` });
  await expectNoViolations(page);

  await moveButton.click();
  const move = page.getByRole("dialog", { name: "Move to Folder" });
  await chooseFolder(page, move, "Folder", folderName);
  await move.getByRole("button", { name: "Move" }).click();
  await expect(row.getByRole("cell", { name: folderName })).toBeVisible();
  await expect(moveButton).toBeFocused();

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
      await row.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Open in new tab" }).click();
    })(),
  ]);
  await expect(tab).toHaveURL(/\/notes\//);
  await tab.close();

  await trashButton.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await trashButton.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await expect(row.getByRole("button", { name: `Move ${title} to the Trash` })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Title" })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expectNoViolations(page);

  await row.getByRole("button", { name: `Move ${title} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("button", { name: `Move ${title} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await item.getByRole("button", { name: `Move ${title} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("a Note card previews whole lines of its text, and an empty Note shows its icon", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const empty = `Card empty ${stamp}`;
  const full = `Card full ${stamp}`;
  await newNote(page, empty);
  await newNote(page, full);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("words to fill the card ".repeat(7).trim());
  await expectSaved(page);

  await page.goto("/items");
  await page.getByRole("radio", { name: "Grid" }).click();
  const card = (title: string) => page.getByRole("listitem").filter({ hasText: title });
  const preview = card(full).locator("p").first();
  await expect(preview).toContainText("words to fill the card");
  await expect(preview).not.toContainText(full);
  // The text box is a whole number of lines tall, so no line is cut in half at the bottom.
  const lines = await preview.evaluate((el) => {
    const style = getComputedStyle(el);
    const inner = el.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom);
    return inner / Number.parseFloat(style.lineHeight);
  });
  expect(Number.isInteger(lines)).toBe(true);
  // The empty Note has only its title, which the card already shows, so it gets the icon.
  await expect(card(empty).locator("svg.size-8")).toBeVisible();
  await expectNoViolations(page);

  // Tidy up.
  for (const title of [empty, full]) {
    await card(title).getByRole("link", { name: new RegExp(title) }).click();
    await page.getByRole("button", { name: "Move to Trash" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
    await expect(page).toHaveURL(/\/items$/);
  }
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await expect(page).toHaveURL(/\/docs\/mcp$/);
  await expect(page.getByRole("heading", { level: 1, name: "MCP server" })).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "What an Agent can do" })).toBeVisible();

  // The address is this installation's own, and every command uses a placeholder, never a real token.
  await page.goto("/docs/mcp/connect");
  const address = page.getByRole("group", { name: "CoreEx server address" });
  await expect(address).toContainText("/mcp");
  await address.getByRole("button", { name: "Copy CoreEx server address" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https?:\/\/.+\/mcp$/);
  await expect(page.getByRole("group", { name: "Claude Code command" })).toContainText("Bearer cx_pat_YOUR_TOKEN");
  expect(await page.getByRole("main").innerText()).not.toMatch(/cx_pat_(?!YOUR_TOKEN)/);

  // The tabs switch clients, and the arrow keys move between them.
  await page.getByRole("tab", { name: "Codex" }).click();
  await expect(page.getByRole("group", { name: "~/.codex/config.toml" })).toBeVisible();
  await page.getByRole("tab", { name: "Codex" }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Claude Code" })).toHaveAttribute("aria-selected", "true");
  await expectNoViolations(page);

  // Every tool is listed once, and the filter box narrows the tables by name.
  await page.goto("/docs/mcp/tools");
  await expect(page.locator("table tbody tr")).toHaveCount(MCP_TOOLS.length);
  await page.getByRole("searchbox", { name: "Filter tools by name" }).fill("trash");
  await expect(page.locator("table tbody tr")).toHaveCount(3);
  await expectNoViolations(page);

  // The sidebar's pages work.
  await page.getByRole("navigation", { name: "Docs pages" }).getByRole("link", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/docs\/mcp\/security$/);
  await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();

  // And from the Access tokens page.
  await page.goto("/settings/tokens");
  await page.getByRole("link", { name: "How to connect an Agent" }).click();
  await expect(page).toHaveURL(/\/docs\/mcp$/);
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.goto("/settings/tokens");
  await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: `Revoke ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
});

test("History keeps the text a save replaced, previews it, and restores it", async ({ page }) => {
  await signIn(page);
  const title = `History ${Date.now()}`;
  await newNote(page, title);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First draft");
  await expectSaved(page);
  await page.keyboard.type(" and a second thought");
  await expectSaved(page);

  const details = page.getByRole("complementary", { name: "Details" });
  await details.getByRole("button", { name: "History" }).click();
  // The first save replaced the heading alone; the saves close behind it keep nothing more.
  const previews = details.getByRole("button", { name: /^Preview the text from/ });
  await expect(previews).toHaveCount(1);
  await previews.click();
  await expect(details.locator("pre[aria-label^='Text from']")).toHaveText(`# ${title}`);
  await expectNoViolations(page);

  // Restoring brings the heading-only text back, and keeps the text it replaced as a newer version.
  await details.getByRole("button", { name: /^Restore the text from/ }).click();
  await expect(page.getByRole("textbox", { name: "Note content" })).not.toContainText("First draft");
  await expect(previews).toHaveCount(2);
  await previews.first().click();
  await expect(details.locator("pre[aria-label^='Text from']").first()).toContainText("First draft and a second thought");

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("Load theirs keeps your text as a (mine) Note in the same Folder with the same Tags", async ({ page }) => {
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const title = `Conflict ${stamp}`;
  const tagName = `kept-${stamp}`;
  const folderName = `Conflict folder ${stamp}`;
  await page.goto("/items");
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(folderName);
  await page.getByRole("button", { name: "Create Folder" }).click();
  await noteWithTag(page, title, tagName);
  await chooseFolder(page, page.getByRole("complementary", { name: "Details" }), "Folder", folderName);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: folderName })).toBeVisible();
  const original = page.url();

  // The Note is changed in another tab, so the next save from this one is a conflict.
  const other = await page.context().newPage();
  await other.goto(original);
  await other.getByRole("textbox", { name: "Note content" }).click();
  await other.keyboard.press("Control+End");
  await other.keyboard.type(" from elsewhere");
  await expectSaved(other);
  await other.close();

  const editor = page.getByRole("textbox", { name: "Note content" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" my unsaved words");
  await expect(page.getByRole("alert").filter({ hasText: "changed somewhere else" })).toBeVisible();

  await page.getByRole("button", { name: "Load theirs" }).click();
  await expect(editor).toContainText("from elsewhere");
  await expect(editor).not.toContainText("my unsaved words");
  // The Details panel may list the copy too, so look in the message above the title.
  const kept = page.locator("p", { hasText: "Your text is kept in" }).getByRole("link", { name: `${title} (mine)` });
  await expect(kept).toBeVisible();

  // The copy holds the typed text, in the same Folder, with the same Tag.
  await kept.click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(`${title} (mine)`);
  await expect(page.getByRole("textbox", { name: "Note content" })).toContainText("my unsaved words");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: folderName })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName })).toBeVisible();

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.goto(original);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

// Every save fails, as when the API is asleep: the Note page's server actions are the POSTs that carry Next-Action.
async function blockSaves(page: Page) {
  await page.route("**/notes/**", (route) =>
    route.request().headers()["next-action"] ? route.abort() : route.continue(),
  );
}

test("text typed while the API cannot be reached comes back after a reload, and is saved", async ({ page }) => {
  test.slow();
  await signIn(page);
  await newNote(page, `Recover ${Date.now()}`);
  const editor = page.getByRole("textbox", { name: "Note content" });
  page.on("dialog", (dialog) => void dialog.accept());

  await blockSaves(page);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("typed while offline");
  await expect(page.getByRole("alert").filter({ hasText: "Cannot reach the CoreEx API" })).toBeVisible();

  // The page is left with the text unsaved; the API answers again.
  await page.unroute("**/notes/**");
  await page.reload();
  await expect(editor).toContainText("typed while offline");
  await expect(page.locator("span", { hasText: "Restored changes that were not saved yet." })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Saved at/ })).toBeVisible();

  // Saved for good: a reload brings it back from the server, with nothing to restore.
  await page.reload();
  await expect(editor).toContainText("typed while offline");
  await expect(page.locator("span", { hasText: "Restored changes that were not saved yet." })).toHaveCount(0);

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

// Only the saves fail: the check for changes (a server action with two arguments) still gets through.
async function blockOnlySaves(page: Page) {
  await page.route("**/notes/**", (route) => {
    const request = route.request();
    if (!request.headers()["next-action"]) return route.continue();
    let args: unknown = null;
    try {
      args = JSON.parse(request.postData() ?? "");
    } catch {
      // Not a plain list of arguments: let it through.
    }
    return Array.isArray(args) && args.length === 5 ? route.abort() : route.continue();
  });
}

test("a Note changed in another tab shows the change without a reload", async ({ page }) => {
  test.slow();
  await signIn(page);
  await newNote(page, `Live ${Date.now()}`);
  const noteUrl = page.url();
  const editor = page.getByRole("textbox", { name: "Note content" });

  const other = await page.context().newPage();
  await other.goto(noteUrl);
  await other.getByRole("textbox", { name: "Note content" }).click();
  await other.keyboard.press("Control+End");
  await other.keyboard.type(" written in another tab");
  await expectSaved(other);
  await other.close();

  // Nothing unsaved here, so the new text is loaded and says why, within one check (10 seconds).
  await expect(page.locator("span", { hasText: "Changed in another tab or device just now." })).toBeVisible({
    timeout: 25_000,
  });
  await expect(editor).toContainText("written in another tab");
  await expect(page.getByRole("status").filter({ hasText: /^Saved at/ })).toBeVisible();

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("unsaved text meeting a change made elsewhere opens the conflict by itself", async ({ page }) => {
  test.slow();
  await signIn(page);
  await newNote(page, `Live conflict ${Date.now()}`);
  const noteUrl = page.url();
  const editor = page.getByRole("textbox", { name: "Note content" });
  page.on("dialog", (dialog) => void dialog.accept());
  const other = await page.context().newPage();
  await other.goto(noteUrl);
  await expect(other.getByRole("textbox", { name: "Note content" })).toBeVisible();

  await blockOnlySaves(page);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" my unsaved words");
  await expect(page.getByRole("alert").filter({ hasText: "Cannot reach the CoreEx API" })).toBeVisible();

  await other.getByRole("textbox", { name: "Note content" }).click();
  await other.keyboard.press("Control+End");
  await other.keyboard.type(" and the other tab");
  await expectSaved(other);
  await other.close();

  // No save is attempted, yet the conflict shows: the check found the newer version.
  await expect(page.getByRole("alert").filter({ hasText: "changed somewhere else" })).toBeVisible({ timeout: 25_000 });
  await expect(editor).toContainText("my unsaved words");

  // Keep mine settles it once saves go through again; then tidy up.
  await page.unroute("**/notes/**");
  await page.getByRole("button", { name: "Keep mine" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved at/ })).toBeVisible();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("logging out removes the unsaved text kept in the browser", async ({ page }) => {
  test.slow();
  await signIn(page);
  await newNote(page, `Recover logout ${Date.now()}`);
  const noteUrl = page.url();
  const kept = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("coreex:unsaved:")).length);
  page.on("dialog", (dialog) => void dialog.accept());

  await blockSaves(page);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" never saved");
  await expect(page.getByRole("alert").filter({ hasText: "Cannot reach the CoreEx API" })).toBeVisible();
  expect(await kept()).toBe(1);

  // Log out is a server action too, so the API must answer again for it. No save is retried by itself.
  await page.unroute("**/notes/**");
  await page.getByRole("button", { name: /^Account/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await kept()).toBe(0);

  // Tidy up.
  await signIn(page);
  await page.goto(noteUrl);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("unsaved text for a Note that changed meanwhile comes back in conflict", async ({ page }) => {
  test.slow();
  await signIn(page);
  await newNote(page, `Recover conflict ${Date.now()}`);
  const original = page.url();
  const editor = page.getByRole("textbox", { name: "Note content" });
  page.on("dialog", (dialog) => void dialog.accept());
  // Another tab opens the Note first: a tab opened later would take this tab's unsaved text.
  const other = await page.context().newPage();
  await other.goto(original);
  await expect(other.getByRole("textbox", { name: "Note content" })).toBeVisible();

  await blockSaves(page);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("my unsaved words");
  await expect(page.getByRole("alert").filter({ hasText: "Cannot reach the CoreEx API" })).toBeVisible();

  // Meanwhile the Note is changed in that tab.
  await other.getByRole("textbox", { name: "Note content" }).click();
  await other.keyboard.press("Control+End");
  await other.keyboard.type(" and elsewhere");
  await expectSaved(other);
  await other.close();

  await page.unroute("**/notes/**");
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "changed somewhere else" })).toBeVisible();
  await expect(editor).toContainText("my unsaved words");

  // Keep mine settles it, and the text is saved.
  await page.getByRole("button", { name: "Keep mine" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved at/ })).toBeVisible();

  // Tidy up.
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("Export downloads a zip with the Note, and a second one inside the minute says to wait", async ({ page }) => {
  test.slow();
  await signIn(page);
  const title = `Export ${Date.now()}`;
  await newNote(page, title);
  const noteUrl = page.url();
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("exported words");
  await expectSaved(page);

  await page.getByRole("button", { name: /^Account/ }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  await expect(page.getByRole("heading", { name: "Export", level: 1 })).toBeVisible();
  await expectNoViolations(page);

  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download everything" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^coreex-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const zip = await readFile(await download.path());
  // A zip starts with "PK", and its entry names are stored as plain text.
  expect(zip.subarray(0, 2).toString()).toBe("PK");
  expect(zip.includes(Buffer.from(`${title}.md`))).toBe(true);
  expect(zip.includes(Buffer.from("manifest.json"))).toBe(true);

  // Straight away again: refused, and the page says to wait.
  await page.getByRole("link", { name: "Download everything" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "once a minute" })).toBeVisible();

  // Tidy up.
  await page.goto(noteUrl);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await page.goto("/items");
  const row = page.getByRole("row").filter({ hasText: target });
  await row.getByRole("button", { name: `Move ${target} to the Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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

  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("the rail shows its labels, collapses to icons and remembers the choice", async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole("navigation", { name: "Main" });
  for (const label of ["Home", "Knowledge Base", "Assets", "Trash"]) {
    await expect(rail.getByRole("link", { name: label }).getByText(label, { exact: true })).toBeVisible();
  }
  await expectNoViolations(page);

  await rail.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(rail.getByText("Knowledge Base", { exact: true })).toBeHidden();
  await expect(rail.getByRole("link", { name: "Knowledge Base" })).toBeVisible();
  await expectNoViolations(page);

  // The cookie is read on the server, so the choice is there from the first paint.
  await page.reload();
  await expect(rail.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(rail.getByText("Knowledge Base", { exact: true })).toBeHidden();
  await rail.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(rail.getByText("Knowledge Base", { exact: true })).toBeVisible();
});

test("the rail resizes by dragging and by keyboard, within its limits, and remembers its width", async ({ page }) => {
  await signIn(page);
  const rail = page.getByRole("navigation", { name: "Main" });
  const handle = rail.getByRole("separator", { name: "Resize sidebar" });
  const width = async () => (await rail.boundingBox())!.width;
  const dragTo = async (x: number) => {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, 300);
    await page.mouse.down();
    await page.mouse.move(x, 300, { steps: 5 });
    await page.mouse.up();
  };
  await expect(rail).toHaveCSS("width", "224px");

  await dragTo(300);
  expect(await width()).toBe(300);
  await expectNoViolations(page);

  // The server's own HTML has the width, so the first paint is right, with no jump once the page's code runs.
  expect(await (await page.request.get("/")).text()).toContain('style="width:300px"');
  await page.reload();
  await expect(rail).toHaveCSS("width", "300px");

  // It cannot go outside its limits.
  await dragTo(900);
  expect(await width()).toBe(320);
  await dragTo(150);
  expect(await width()).toBe(192);

  // Dragged well below the minimum it collapses, and opens again at the width from before that drag.
  await dragTo(260);
  await dragTo(80);
  expect(await width()).toBe(64);
  await expect(rail.getByText("Knowledge Base", { exact: true })).toBeHidden();
  await page.reload();
  expect(await width()).toBe(64);
  await rail.getByRole("button", { name: "Expand sidebar" }).click();
  expect(await width()).toBe(260);
  await dragTo(80);
  await dragTo(150);
  expect(await width()).toBe(260);

  // The keyboard does the same.
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  expect(await width()).toBe(276);
  await page.keyboard.press("Home");
  expect(await width()).toBe(192);
  await page.keyboard.press("ArrowLeft");
  expect(await width()).toBe(64);
  await page.keyboard.press("ArrowRight");
  expect(await width()).toBe(192);
  await page.keyboard.press("End");
  expect(await width()).toBe(320);

  // The shortcut toggles it from anywhere, and the theme and account stay on screen at every width.
  await page.keyboard.press("Control+\\");
  expect(await width()).toBe(64);
  await expect(rail.getByRole("button", { name: /^Account/ })).toBeInViewport();
  await page.keyboard.press("Control+\\");
  expect(await width()).toBe(320);
  await expect(rail.getByRole("button", { name: /^Theme/ })).toBeInViewport();
});

test("Ctrl+B is still bold in the Note editor, not the rail", async ({ page }) => {
  await signIn(page);
  const title = `Bold probe ${Date.now()}`;
  await newNote(page, title);
  const rail = page.getByRole("navigation", { name: "Main" });
  const before = (await rail.boundingBox())!.width;
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+B");
  await page.keyboard.type("x");
  await expect(page.locator(".cm-content")).toContainText("**x**");
  expect((await rail.boundingBox())!.width).toBe(before);

  await expectSaved(page);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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

  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.getByRole("button", { name: /^Move renamed.* to the Trash$/ }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
});

test("a Folder opens as a Graph, its Items reached by keyboard and listed as a table", async ({ page }) => {
  test.setTimeout(60_000);
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
  await trashRows(page, [source, target]);
});

test("the Graph filters by Tag and type and colours by Tag, all kept in the address", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const stamp = Date.now();
  const tagged = `Filter tagged ${stamp}`;
  const plain = `Filter plain ${stamp}`;
  const tagName = `filter-${stamp}`;
  await newNote(page, plain);
  await noteWithTag(page, tagged, tagName);

  await page.goto("/graph");
  await page.getByRole("toolbar", { name: "Filter by Tag" }).getByRole("button", { name: tagName }).click();
  await expect(page).toHaveURL(/[?&]tag=/);
  // The other Note fades, and a keyboard User can still reach it and hear why.
  const faded = page.getByRole("link", { name: new RegExp(`^${plain}, .*not in the filter$`) });
  await expect(faded).toBeVisible();
  await expect(faded).toHaveClass(/opacity-25/);
  await expect(page.getByRole("link", { name: new RegExp(`^${tagged}, .*Tags: ${tagName}$`) })).toBeVisible();

  await page.getByRole("radiogroup", { name: "Colour by" }).getByRole("radio", { name: "Tag" }).click();
  await expect(page.getByRole("list", { name: "Colours" }).getByText(tagName)).toBeVisible();
  await expectNoViolations(page);

  // A reload keeps the view, and the table lists only what matches.
  await page.reload();
  await expect(page.getByRole("list", { name: "Colours" }).getByText(tagName)).toBeVisible();
  await page.getByRole("button", { name: "Show as table" }).click();
  await expect(page.getByRole("rowheader", { name: tagged })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: plain })).toHaveCount(0);
  await page.getByRole("button", { name: "Show as graph" }).click();

  // Type: nothing that is an Asset here, so the Note fades too and Clear filters brings everything back.
  await page.getByRole("radiogroup", { name: "Show only" }).getByRole("radio", { name: "Assets" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`^${tagged}, .*not in the filter$`) })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`^${plain}, Note`) })).toBeVisible();
  await expect(page.getByRole("link", { name: /not in the filter$/ })).toHaveCount(0);

  // Only linked Items hides what has no Links.
  await page.getByRole("button", { name: "Only linked Items" }).click();
  await expect(page).toHaveURL(/linked=1/);
  await expect(page.getByRole("link", { name: new RegExp(`^${plain}, Note`) })).toHaveCount(0);

  await page.goto("/items");
  await trashRows(page, [plain, tagged]);
  await page.goto("/tags");
  await deleteTag(page, tagName);
});

test("Graph Insights answer in the canvas, and the table sorts and shows only orphans", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const target = `Insight hub ${stamp}`;
  const source = `Insight source ${stamp}`;
  const lone = `Insight lone ${stamp}`;
  await newNote(page, lone);
  await newNote(page, target);
  await newNote(page, source);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`See [[${target}`);
  await page.getByRole("option", { name: new RegExp(target) }).click();
  await page.keyboard.press("Enter");
  await expectSaved(page);

  await page.goto("/graph");
  await page.getByRole("button", { name: "Insights" }).click();
  const panel = page.getByRole("complementary", { name: "Insights" });
  await expectNoViolations(page);

  // An answer lights its nodes and dims the rest; pressing it again clears it.
  const groupHeading = panel.getByRole("heading", { name: /separate group/ });
  await expect(groupHeading).toBeVisible();
  const answer = panel.getByRole("button", { name: /Items? with no Links/ });
  const hub = page.getByRole("link", { name: new RegExp(`^${target}, Note`) });
  await answer.click();
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  await expect(hub).toHaveClass(/opacity-25/);
  await expect(page.getByRole("link", { name: new RegExp(`^${lone}, Note`) })).toHaveClass(/opacity-100/);
  await answer.click();
  await expect(hub).toHaveClass(/opacity-100/);

  // Kept open across a reload.
  await page.reload();
  await expect(panel).toBeVisible();

  await page.getByRole("button", { name: "Show as table" }).click();
  await page.getByRole("button", { name: "Linked from" }).click();
  await expect(page.getByRole("columnheader", { name: "Linked from" })).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("button", { name: "Only orphans" }).click();
  await expect(page.getByRole("rowheader", { name: lone })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: target })).toHaveCount(0);

  // Leave the panel closed for the tests that follow.
  await page.getByRole("button", { name: "Show as graph" }).click();
  await page.getByRole("button", { name: "Insights" }).click();
  await page.goto("/items");
  await trashRows(page, [source, target, lone]);
});

test("the Graph finds a node by title, with / and from the palette, and keeps it lit until you click away", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page);
  const stamp = Date.now();
  const title = `Findable ${stamp}`;
  await newNote(page, title);

  await page.goto("/graph");
  const box = page.getByRole("combobox", { name: "Find an Item in the graph" });
  await expect(box).toBeVisible();
  await expect(async () => {
    await page.locator("body").press("/");
    await expect(box).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.type(String(stamp));
  await expect(page.getByRole("option", { name: title })).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole("option", { name: title }).click();

  // Focus lands on the node, zoomed so its label reads, and the rest dims.
  const node = page.getByRole("link", { name: new RegExp(`^${title}, Note`) });
  await expect(node).toBeFocused();
  await expect(node).toHaveClass(/opacity-100/);
  const dimmed = page.locator('svg g[role="link"].opacity-25');
  await expect(dimmed.first()).toBeAttached();

  // Clicking the background clears it, and so does Escape after finding again.
  await page.getByRole("group", { name: /^Graph of/ }).click({ position: { x: 3, y: 3 } });
  await expect(dimmed).toHaveCount(0);

  // From anywhere, through the palette.
  await page.goto("/items");
  const palette = await openPalette(page);
  await palette.getByRole("combobox").fill(title);
  await palette.getByRole("option", { name: `Show \u201c${title}\u201d in Graph` }).click();
  await expect(page).toHaveURL(/\/graph\?focus=/);
  await expect(node).toHaveClass(/opacity-100/);
  await expect(dimmed.first()).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(dimmed).toHaveCount(0);

  await page.goto("/items");
  await trashRows(page, [title]);
});

test("a Note lists plain mentions of it, and Link it makes them a Backlink", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page);
  const stamp = Date.now();
  const target = `Mentioned ${stamp}`;
  const other = `Mentioner ${stamp}`;
  await newNote(page, other);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`I wrote about ${target} today`);
  await expectSaved(page);
  await newNote(page, target);

  const section = page.getByRole("region", { name: /Mentioned without a Link/ });
  await page.reload();
  await expect(section.getByRole("link", { name: other })).toBeVisible();
  await expect(section.locator("mark")).toHaveText(target);
  await expectNoViolations(page);

  await section.getByRole("button", { name: `Link it in ${other}` }).click();
  await expect(section.getByText("No other Note mentions this title.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Backlinks" }).getByRole("link", { name: other })).toBeVisible();

  await page.goto("/items");
  await trashRows(page, [other, target]);
});

test("a Folder's Graph loads a stub's neighbours onto the canvas, and they stay", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const stamp = Date.now();
  const far = `Expand far ${stamp}`;
  const stub = `Expand stub ${stamp}`;
  const link = async (title: string) => {
    await page.getByRole("textbox", { name: "Note content" }).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(`See [[${title}`);
    await page.getByRole("option", { name: new RegExp(title) }).click();
    await page.keyboard.press("Enter");
    await expectSaved(page);
  };
  await newNote(page, far);
  await newNote(page, stub);
  await link(far);
  const { parent, parentUrl, parentId } = await nestedNote(page, stamp);
  await link(stub);

  await page.goto(`/graph?folderId=${parentId}`);
  const stubNode = page.getByRole("link", { name: new RegExp(`^${stub}, `) });
  const farNode = page.getByRole("link", { name: new RegExp(`^${far}, `) });
  await expect(stubNode).toBeAttached();
  await expect(farNode).toHaveCount(0);

  // By keyboard, as the canvas's name says.
  await stubNode.focus();
  await expect(page.getByRole("button", { name: `Load neighbours of ${stub}` })).toBeVisible();
  await expectNoViolations(page);
  await page.keyboard.press("e");
  await expect(farNode).toBeAttached();
  await expect(page.getByRole("button", { name: `Load neighbours of ${stub}` })).toHaveCount(0);

  await page.goto("/items");
  await trashRows(page, [stub, far]);
  await page.goto(parentUrl);
  await trashFolder(page, parent);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("the Graph pinches to zoom, pans with two fingers, long press shows the card, and a tap opens", async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page);
    const title = `Touch ${Date.now()}`;
    await newNote(page, title);
    const id = page.url().split("/").pop()!;

    await page.goto(`/graph?focus=${id}`);
    const svg = page.getByRole("group", { name: /^Graph of/ });
    const node = page.getByRole("link", { name: new RegExp(`^${title}, Note`) });
    await expect(node).toBeVisible();
    const box = (await svg.boundingBox())!;
    const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });
    const touch = await page.context().newCDPSession(page);
    const send = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]) =>
      touch.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const transform = () => svg.locator(":scope > g").first().getAttribute("transform");
    const view = async () => {
      const [, x, y, k] = /translate\((\S+) (\S+)\) scale\((\S+)\)/.exec((await transform())!)!;
      return { x: Number(x), y: Number(y), k: Number(k) };
    };

    // Pinch out from two free corners of the canvas.
    const before = await view();
    await send("touchStart", [at(40, 40), at(80, 40)]);
    await send("touchMove", [at(30, 40), at(130, 40)]);
    await send("touchEnd", []);
    const pinched = await view();
    expect(pinched.k).toBeGreaterThan(before.k * 2);

    // Two fingers moving together pan without zooming.
    await send("touchStart", [at(40, 40), at(80, 40)]);
    await send("touchMove", [at(70, 70), at(110, 70)]);
    await send("touchEnd", []);
    const panned = await view();
    expect(panned.k).toBeCloseTo(pinched.k);
    expect(panned.x).toBeCloseTo(pinched.x + 30);

    // Back to the node, for the rest.
    await page.goto(`/graph?focus=${id}`);
    await expect(node).toBeVisible();
    const dot = node.locator("circle:not(.hidden), rect").last();
    const spot = (await dot.boundingBox())!;
    const centre = { x: spot.x + spot.width / 2, y: spot.y + spot.height / 2 };

    // A long press shows the card and does not open the Item.
    await send("touchStart", [centre]);
    await page.waitForTimeout(700);
    await send("touchEnd", []);
    await expect(page.getByText("Note · 0 Links · 0 Backlinks")).toBeVisible();
    await expect(page).toHaveURL(/\/graph/);

    // A tap opens it.
    await page.touchscreen.tap(centre.x, centre.y);
    await expect(page).toHaveURL(new RegExp(`/notes/${id}`));

    await page.goto("/items");
    await trashRows(page, [title]);
  });
});

test("the Graph's Similar switch says what it finds, and is kept in the address", async ({ page }) => {
  await signIn(page);
  await newNote(page, `Similar ${Date.now()}`);
  const title = await page.getByRole("textbox", { name: "Title" }).inputValue();

  await page.goto("/graph");
  await page.getByRole("button", { name: "Similar" }).click();
  await expect(page).toHaveURL(/similar=1/);
  // Whether or not this stack can embed, the answer is said in words, and nothing is drawn as a Link.
  await expect(page.getByRole("status").filter({ hasText: /similar/i })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Looking for" })).toHaveCount(0);
  await page.getByRole("button", { name: "Insights" }).click();
  await expect(page.getByRole("complementary", { name: "Insights" }).getByRole("heading", { name: "Suggested Links" })).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Insights" }).click();

  await page.goto("/items");
  await trashRows(page, [title]);
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
  const box = (await node.locator("circle:not(.hidden)").boundingBox())!;

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
  await node.locator("circle:not(.hidden)").click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
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
  // Only what is on screen gets a label, so it may be another node's.
  await expect(nodes.locator("text").first()).toHaveCSS("opacity", "1");

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
  await trashRows(page, titles);
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
  await trashRows(page, [source, target]);
});

// A Folder with a subfolder holding one Note. Leaves you on the Note.
async function nestedNote(page: Page, stamp: number) {
  const names = { parent: `Tree parent ${stamp}`, child: `Tree child ${stamp}`, note: `Tree note ${stamp}` };
  await page.goto("/items");
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(names.parent);
  await page.getByRole("button", { name: "Create Folder" }).click();
  await expect(page.getByLabel("Folder name")).toBeHidden();
  await page.goto("/items");
  await page.getByRole("main").getByRole("link", { name: names.parent }).click();
  await expect(page.getByRole("heading", { name: names.parent, level: 1 })).toBeVisible();
  const parentUrl = page.url();
  await page.getByRole("button", { name: `New subfolder in ${names.parent}` }).click();
  await page.getByRole("dialog", { name: "New subfolder" }).getByLabel("Name").fill(names.child);
  await page.getByRole("dialog", { name: "New subfolder" }).getByRole("button", { name: "Create" }).click();
  await page.getByRole("main").getByRole("link", { name: names.child }).click();
  await expect(page.getByRole("heading", { name: names.child, level: 1 })).toBeVisible();
  await newNote(page, names.note);
  return { ...names, parentUrl, parentId: parentUrl.split("/").pop()! };
}

test("the Graph's Folder panel opens a Folder's graph, filters, and stays hidden once hidden", async ({ page }) => {
  await signIn(page);
  const { parent, child, parentUrl, parentId } = await nestedNote(page, Date.now());

  await page.goto("/graph");
  const panel = page.getByRole("complementary", { name: "Folders" });
  await expect(panel.getByRole("link", { name: "All Items" })).toHaveAttribute("aria-current", "page");
  await panel.getByRole("link", { name: new RegExp(parent) }).click();
  await expect(page).toHaveURL(new RegExp(`/graph\\?folderId=${parentId}$`));
  await expect(panel.getByRole("link", { name: new RegExp(parent) })).toHaveAttribute("aria-current", "page");
  await expectNoViolations(page);
  // Nothing in it is wider than the panel, so the counts stay on screen.
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  // The filter finds a subfolder without opening the tree.
  await panel.getByRole("searchbox", { name: "Filter Folders" }).fill(child);
  await panel.getByRole("list", { name: "Folders" }).getByRole("link", { name: new RegExp(child) }).click();
  await expect(page).not.toHaveURL(new RegExp(parentId));
  // The tree opens along the path to it.
  await expect(panel.getByRole("link", { name: new RegExp(child) })).toHaveAttribute("aria-current", "page");
  await expect(panel.getByRole("link", { name: new RegExp(parent) })).toBeVisible();

  const toggle = page.getByRole("button", { name: "Folders", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(panel).toBeVisible();

  // On a phone it opens as a Sheet, and choosing a Folder closes it.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/graph");
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Folders" });
  await sheet.getByRole("link", { name: new RegExp(parent) }).click();
  await expect(page).toHaveURL(new RegExp(`folderId=${parentId}`));
  await expect(sheet).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(parentUrl);
  await trashFolder(page, parent);
});

test("the Graph's Tree mode shows Folders and Items, opens and shuts Folders, and is kept in the URL", async ({ page }) => {
  await signIn(page);
  const { parent, child, note, parentUrl, parentId } = await nestedNote(page, Date.now());

  await page.goto(`/graph?folderId=${parentId}`);
  await page.getByRole("radiogroup", { name: "Draw the graph by" }).getByRole("radio", { name: "Tree" }).click();
  await expect(page).toHaveURL(new RegExp(`folderId=${parentId}&mode=tree`));

  const parentNode = page.getByRole("button", { name: `${parent}, Folder, 1 inside, expanded` });
  const childNode = page.getByRole("button", { name: new RegExp(`^${child}, Folder, 1 inside`) });
  const noteNode = page.getByRole("link", { name: new RegExp(`^${note}, Note, In `) });
  await expect(parentNode).toBeVisible();
  await expect(childNode).toHaveAttribute("aria-expanded", "true");
  await expect(noteNode).toBeVisible();
  await expectNoViolations(page);

  // The panel and the reload both keep the mode.
  await expect(page.getByRole("complementary", { name: "Folders" }).getByRole("link", { name: "All Items" })).toHaveAttribute("href", "/graph?mode=tree");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Tree" })).toBeChecked();

  // The keyboard: arrows follow the tree, and Enter shuts a Folder, which then shows its count.
  await parentNode.focus();
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
    if (await childNode.evaluate((el) => el === document.activeElement)) break;
    await parentNode.focus();
    await page.keyboard.press(key);
  }
  await expect(childNode).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(noteNode).toHaveCount(0);
  await expect(childNode).toHaveAttribute("aria-expanded", "false");
  await expect(childNode.locator("text").first()).toHaveText("1");
  await expect(childNode).toBeFocused();
  await page.keyboard.press("Space");
  await expect(childNode).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(childNode).toHaveAttribute("aria-expanded", "false");

  // A click opens it again, the hover card names it, and a Note opens its page.
  await childNode.hover();
  await expect(page.getByText("Folder · 1 inside")).toBeVisible();
  await childNode.click();
  await expect(noteNode).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset layout" })).toHaveCount(0);
  await expectNoViolations(page);
  await noteNode.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/notes\//);

  await page.goto(parentUrl);
  await trashFolder(page, parent);
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

test("an Application is made from a pasted posting, renamed, and moved through its Stages", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  await page.goto("/career/applications");
  await page.getByRole("button", { name: "New Application" }).click();
  await expectNoViolations(page);
  await page.keyboard.press("Escape");

  await newApplication(page, `Acme ${stamp}`, "Engineer");
  // By id: the page being left, with its own Posting field in the dialog, stays on screen for a moment.
  await expect(page.locator("#posting-text")).toHaveValue("We are hiring.");
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-current", "step");
  await expectNoViolations(page);

  // Moving into Applied dates the Application and adds a timeline line.
  await page.getByRole("button", { name: "Applied", exact: true }).click();
  await expect(page.getByRole("button", { name: "Applied", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Moved to Applied")).toBeVisible();
  await expect(page.getByText(/^Applied .*\d{4}$/)).toBeVisible();

  // Editing the company follows the automatic title; typing a title of your own stops that.
  await page.getByLabel("Company").fill(`Beta ${stamp}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Engineer at Beta ${stamp}`, level: 1 })).toBeVisible();
  await page.getByLabel("Title").fill(`My pick ${stamp}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: `My pick ${stamp}`, level: 1 })).toBeVisible();
  await page.getByLabel("Company").fill(`Gamma ${stamp}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Company")).toHaveValue(`Gamma ${stamp}`);
  await expect(page.getByRole("heading", { name: `My pick ${stamp}`, level: 1 })).toBeVisible();
});

test("an Application closes with a reason, takes notes, and a follow-up is back-dated", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  await newApplication(page, `Delta ${stamp}`, "Analyst");
  await expect(page.locator("#posting-text")).toBeVisible();

  // Closing asks why first; cancelling changes nothing.
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await expect(page.getByLabel("Why did it close?")).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await page.getByLabel("Why did it close?").selectOption("WITHDREW");
  await page.getByRole("button", { name: "Close Application" }).click();
  await expect(page.getByRole("button", { name: "Closed", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Closed: Withdrew")).toBeVisible();

  // A note, then an edit of it, then a follow-up dated in the past that sorts before today's entries.
  await page.getByLabel("Add to the timeline").fill("Spoke to the recruiter");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Spoke to the recruiter")).toBeVisible();
  await page.getByRole("button", { name: /^Edit: .* Spoke to the recruiter$/ }).click();
  await page.getByLabel("Note", { exact: true }).fill("Spoke to the recruiter twice");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Spoke to the recruiter twice")).toBeVisible();

  await page.getByLabel("Date", { exact: true }).last().fill("2020-01-15");
  await page.getByRole("button", { name: "I followed up" }).click();
  const lines = page.getByRole("list").filter({ hasText: "Moved to Closed" }).getByRole("listitem");
  await expect(lines.first()).toContainText("Jan 15, 2020");
  await expect(lines.first()).toContainText("I followed up");
  await expectNoViolations(page);

  // A note can go; a Stage entry has no Delete.
  await page.getByRole("button", { name: /^Delete: .* Spoke to the recruiter twice$/ }).click();
  await expect(page.getByText("Spoke to the recruiter twice")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete: .* Moved to/ })).toHaveCount(0);
});

test.describe("a User away from UTC", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("an Application takes an interview at the time typed, and one follow-up reminder", async ({ page }) => {
    await signIn(page);
    const stamp = Date.now();
    await newApplication(page, `Echo ${stamp}`, "Tester");
    await expect(page.locator("#posting-text")).toBeVisible();

    // The time typed comes back as typed, though it is stored as an instant on the next UTC day.
    await page.getByRole("button", { name: "Add interview" }).click();
    await page.getByLabel("Interview time").fill("2030-03-05T17:30");
    await page.getByLabel("Type").selectOption("VIDEO");
    await page.getByLabel("Interview notes").fill("With the team");
    await expectNoViolations(page);
    await page.getByRole("button", { name: "Save interview" }).click();
    await expect(page.getByText("Mar 5, 2030, 5:30 PM").first()).toBeVisible();
    await expect(page.getByText("Interview (Video): With the team")).toBeVisible();

    await page.getByRole("button", { name: /^Edit interview/ }).click();
    await page.getByLabel("Interview time").fill("2030-03-06T09:00");
    await page.getByRole("button", { name: "Save interview" }).click();
    await expect(page.getByText("Mar 6, 2030, 9:00 AM").first()).toBeVisible();
    // The Next step names the interview in the User's timezone, which the browser told the server about.
    await expect(page.getByText("Interview Mar 6, 09:00", { exact: true })).toBeVisible();

    // The reminder is set with a date alone, then a time, then cleared; "I followed up" would clear it too.
    await page.getByLabel("Reminder date").fill("2030-03-10");
    await page.getByRole("button", { name: "Set reminder" }).click();
    await expect(page.getByText("Follow up on Mar 10, 2030 (09:00 unless you set a time).")).toBeVisible();
    await page.getByLabel("Time", { exact: true }).fill("14:30");
    await page.getByRole("button", { name: "Set reminder" }).click();
    await expect(page.getByText("Follow up on Mar 10, 2030 at 14:30.")).toBeVisible();
    await expectNoViolations(page);
    await page.getByRole("button", { name: "I followed up" }).click();
    await expect(page.getByText("No reminder set.")).toBeVisible();

    await page.getByRole("button", { name: /^Remove interview/ }).click();
    await expect(page.getByText("Interview (Video)")).toHaveCount(0);
  });

  test("the Calendar shows an interview on the User's own day, even near midnight, and a reminder on its day", async ({ page }) => {
    await signIn(page);
    const stamp = Date.now();
    const company = `Kilo ${stamp}`;
    await newApplication(page, company, "Tester");
    await expect(page.locator("#posting-text")).toBeVisible();
    // 23:30 in Los Angeles on 5 March is already 6 March in UTC.
    await page.getByRole("button", { name: "Add interview" }).click();
    await page.getByLabel("Interview time").fill("2030-03-05T23:30");
    await page.getByLabel("Type").selectOption("VIDEO");
    await page.getByRole("button", { name: "Save interview" }).click();
    await expect(page.getByText("Mar 5, 2030, 11:30 PM").first()).toBeVisible();
    await page.getByLabel("Reminder date").fill("2030-03-10");
    await page.getByLabel("Time", { exact: true }).fill("14:30");
    await page.getByRole("button", { name: "Set reminder" }).click();
    await expect(page.getByText("Follow up on Mar 10, 2030 at 14:30.")).toBeVisible();

    await page.goto("/career/applications?view=calendar&month=2030-03");
    const day = (date: string) => page.locator(`time[datetime="${date}"]`).locator("xpath=ancestor::li[1]");
    await expect(page.getByRole("heading", { name: "March 2030", level: 2 })).toBeVisible();
    await expect(day("2030-03-05")).toContainText("23:30 Video interview");
    await expect(day("2030-03-05")).toContainText(`Tester at ${company}`);
    await expect(day("2030-03-06")).not.toContainText("Video interview");
    await expect(day("2030-03-10")).toContainText("14:30 Follow up");
    await expectNoViolations(page);

    // The month is in the address, and Previous, Next and Today move it.
    await page.getByRole("navigation", { name: "Month" }).getByRole("link", { name: "Next month" }).click();
    await expect(page).toHaveURL(/month=2030-04/);
    await expect(page.getByRole("heading", { name: "April 2030", level: 2 })).toBeVisible();
    await page.getByRole("navigation", { name: "Month" }).getByRole("link", { name: "Today" }).click();
    await expect(page.getByRole("heading", { name: "March 2030", level: 2 })).toHaveCount(0);

    // An entry opens its Application.
    await page.goto("/career/applications?view=calendar&month=2030-03");
    await day("2030-03-05").getByRole("link", { name: new RegExp(`Video interview.*${company}`) }).click();
    await expect(page.getByRole("heading", { name: `Tester at ${company}`, level: 1 })).toBeVisible();

    // On a phone it is one week at a time.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/career/applications?view=calendar&week=2030-03-04");
    await expect(page.getByRole("heading", { name: /Mar 4 to Mar 10, 2030/ })).toBeVisible();
    await expect(day("2030-03-05")).toContainText("23:30 Video interview");
    await expect(day("2030-03-12")).toBeHidden();
    await expectNoViolations(page);
    await page.getByRole("navigation", { name: "Week" }).getByRole("link", { name: "Next week" }).click();
    await expect(page.getByRole("heading", { name: /Mar 11 to Mar 17, 2030/ })).toBeVisible();
  });
});

test("the Applications list is grouped by Stage with a Needs you filter, and the page shows its Next step", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const company = `Foxtrot ${stamp}`;
  await newApplication(page, company, "Planner");

  // A new Application is Saved, so it needs applying; the page says so.
  await expect(page.locator("#posting-text")).toBeVisible();
  const card = page.getByRole("region", { name: "Next step" });
  await expect(card).toContainText("Apply");
  await expect(card).toContainText("Needs you now.");
  await expectNoViolations(page);

  await page.goto("/career/applications");
  const row = page.getByRole("link", { name: new RegExp(`Planner at ${company}`) });
  await expect(page.getByRole("heading", { name: "Saved", level: 2 })).toBeVisible();
  await expect(row).toContainText("Needs you: Apply");
  await page.getByRole("navigation", { name: "Show" }).getByRole("link", { name: "Needs you" }).click();
  await expect(page).toHaveURL(/needs=1/);
  await expect(page.getByRole("navigation", { name: "Show" }).getByRole("link", { name: "Needs you" })).toHaveAttribute("aria-current", "page");
  await expect(row).toBeVisible();
  await expectNoViolations(page);

  // Applied a moment ago, it only waits, so Needs you drops it while All keeps it under Applied.
  await row.click();
  await page.getByRole("button", { name: "Applied", exact: true }).click();
  await expect(page.getByRole("region", { name: "Next step" })).toContainText("Waiting");
  await page.goto("/career/applications?needs=1");
  await expect(page.getByRole("link", { name: new RegExp(`Planner at ${company}`) })).toHaveCount(0);
  await page.goto("/career/applications");
  await expect(page.getByRole("link", { name: new RegExp(`Planner at ${company}`) })).toContainText("Waiting");
});

test("several Applications are selected with a range and moved, tagged and trashed together", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const names = [1, 2, 3].map((n) => `Golf${n} ${stamp}`);
  for (const company of names) await newApplication(page, company, "Dev");
  await page.goto("/career/applications");
  const box = (n: number) => page.getByRole("checkbox", { name: `Select Dev at ${names[n - 1]}` });
  const bar = page.getByRole("region", { name: "Bulk actions" });

  // A click, then Shift-click at the other end, selects everything between; the heading's box does the whole group.
  await box(3).click();
  await box(1).click({ modifiers: ["Shift"] });
  await expect(box(2)).toBeChecked();
  await expect(bar).toContainText(/\d+ selected/);
  await expectNoViolations(page);
  await bar.getByRole("button", { name: "Clear selection" }).click();
  await expect(bar).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Select all in Saved" }).click();
  await expect(box(1)).toBeChecked();
  await bar.getByRole("button", { name: "Clear selection" }).click();

  // Move three at once: each gets a timeline entry and they land under Applied, waiting.
  for (const n of [1, 2, 3]) await box(n).click();
  await bar.getByLabel("Move to").selectOption("APPLIED");
  await bar.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByText("Moved 3 Applications")).toBeVisible();
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole("link", { name: new RegExp(`Dev at ${names[0]}`) })).toContainText("Waiting");

  // Tag two, then take the Tag off again.
  await box(1).click();
  await box(2).click();
  await bar.getByLabel("Tag", { exact: true }).fill(`bulk${stamp}`);
  await bar.getByRole("button", { name: "Add Tag" }).click();
  await expect(page.getByText("Tagged 2 Applications")).toBeVisible();
  // Each action clears what it worked on, so the same two are picked again.
  await box(1).click();
  await box(2).click();
  await bar.getByLabel("Remove").selectOption({ label: `bulk${stamp}` });
  await bar.getByRole("button", { name: "Remove Tag" }).click();
  await expect(page.getByText("Untagged 2 Applications")).toBeVisible();

  // Closing asks for one reason for everyone selected.
  await box(1).click();
  await box(2).click();
  await bar.getByLabel("Move to").selectOption("CLOSED");
  await bar.getByLabel("Why did they close?").selectOption("WITHDREW");
  await bar.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Closed", level: 2 })).toBeVisible();

  // Trash one, then Undo from the toast.
  await box(3).click();
  await bar.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByText("Moved 1 Application to the Trash")).toBeVisible();
  await expect(box(3)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(box(3)).toBeVisible();
});

test("the Board moves a card by drag or menu, Undo sends nothing, and a move made elsewhere wins", async ({ page }) => {
  test.setTimeout(120_000); // five waits for an Undo toast to close
  await signIn(page);
  const stamp = Date.now();
  const names = ["Hotel", "India", "Juliet"].map((n) => `${n} ${stamp}`);
  for (const company of names) await newApplication(page, company, "Dev");
  await page.goto("/career/applications?view=board");
  const column = (stage: string) => page.getByRole("region", { name: new RegExp(`^${stage}`) });
  const card = (n: number, stage: string) =>
    column(stage).locator("li[draggable=true]").filter({ hasText: `Dev at ${names[n]}` });
  const toast = (n: number, stage: string) => page.getByText(`Moved Dev at ${names[n]} to ${stage}`);
  const grab = { sourcePosition: { x: 4, y: 4 } }; // the card's padding, not its link or menu
  await expect(card(0, "Saved")).toBeVisible();
  await expectNoViolations(page);

  // Drag shows the move at once; Undo before the toast closes means nothing is ever sent.
  await card(0, "Saved").dragTo(column("Applied"), grab);
  await expect(card(0, "Applied")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card(0, "Saved")).toBeVisible();
  await expect(toast(0, "Applied")).toBeHidden();
  await page.waitForTimeout(6000);
  await page.reload();
  await expect(card(0, "Saved")).toBeVisible();

  // Left alone, the write goes when the toast closes.
  await card(0, "Saved").dragTo(column("Applied"), grab);
  await expect(toast(0, "Applied")).toBeHidden({ timeout: 15000 });
  await page.reload();
  await expect(card(0, "Applied")).toBeVisible();
  await expect(card(0, "Applied")).toContainText("Waiting");

  // The keyboard moves a card with its Move to menu.
  await page.getByLabel(`Move Dev at ${names[1]} to`).selectOption("SCREENING");
  await expect(card(1, "Screening")).toBeVisible();
  await expect(toast(1, "Screening")).toBeHidden({ timeout: 15000 });
  await page.reload();
  await expect(card(1, "Screening")).toBeVisible();

  // Dropping on Closed asks why first.
  // Closed sits off the right edge of a narrow window, so the drag is replayed as its two events.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await card(2, "Saved").dispatchEvent("dragstart", { dataTransfer: transfer });
  await column("Closed").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(card(2, "Saved")).toBeVisible();
  await page.getByLabel(`Why did Dev at ${names[2]} close?`).selectOption("WITHDREW");
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Close Application" }).click();
  await expect(card(2, "Closed")).toBeVisible();
  await expect(toast(2, "Closed")).toBeHidden({ timeout: 15000 });
  await page.reload();
  await expect(card(2, "Closed")).toBeVisible();

  // Moved elsewhere meanwhile: that move wins, the card snaps to where it is and a message says so.
  const href = await card(0, "Applied").getByRole("link").getAttribute("href");
  const other = await page.context().newPage();
  await other.goto(href!);
  await other.getByRole("button", { name: "Interview", exact: true }).click();
  await expect(other.getByRole("button", { name: "Interview", exact: true })).toHaveAttribute("aria-current", "step");
  await other.close();
  const again = await page.evaluateHandle(() => new DataTransfer());
  await card(0, "Applied").dispatchEvent("dragstart", { dataTransfer: again });
  await column("Screening").dispatchEvent("drop", { dataTransfer: again });
  await expect(card(0, "Screening")).toBeVisible();
  await expect(page.getByText(/was moved somewhere else/)).toBeVisible({ timeout: 15000 });
  await expect(card(0, "Interview")).toBeVisible();
  await expect(card(0, "Screening")).toHaveCount(0);
});

test("an Application sits in a Folder, takes a Tag shown on its row, and goes to the Trash and back", async ({ page }) => {
  test.slow();
  await signIn(page);
  const stamp = Date.now();
  const company = `Lima ${stamp}`;
  const title = `Dev at ${company}`;
  const tagName = `app-probe-${stamp}`;
  const folderName = `App folder ${stamp}`;
  await page.goto("/items");
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(folderName);
  await page.getByRole("button", { name: "Create Folder" }).click();
  await newApplication(page, company, "Dev");
  await expect(page.locator("#posting-text")).toBeVisible();

  // The Details panel moves it into a Folder and tags it; the breadcrumb follows.
  const details = page.getByRole("complementary", { name: "Details" });
  await chooseFolder(page, details, "Folder", folderName);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: folderName })).toBeVisible();
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByPlaceholder("Find or create a Tag").fill(tagName);
  await page.getByRole("option", { name: `Create “${tagName}”` }).click();
  await expect(page.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName })).toBeVisible();
  await expectNoViolations(page);

  // The Folder lists it and opens its Career page; the Applications list shows the Tag on its row.
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: folderName }).click();
  await page.getByRole("main").getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await page.goto("/career/applications");
  await expect(page.getByRole("link", { name: new RegExp(title) })).toContainText(tagName);

  // Move to Trash from its page; the Trash lists it and Restore brings it back with its Folder.
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/career\/applications$/);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
  await page.goto("/trash");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("Application");
  await expectNoViolations(page);
  await row.getByRole("button", { name: `Restore ${title}` }).click();
  await expect(page.getByText(`Restored "${title}"`)).toBeVisible();
  await page.goto("/career/applications");
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();

  // Tidy up: trash it for good, then the Folder and the Tag.
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await page.goto("/trash");
  await row.getByRole("button", { name: `Delete forever: ${title}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByText(`Deleted "${title}" for good`)).toBeVisible();
  await page.goto("/items");
  await page.getByRole("main").getByRole("link", { name: folderName }).click();
  await trashFolder(page, folderName);
  await page.goto("/tags");
  await page.getByRole("main").getByRole("link", { name: tagName }).click();
  await deleteTag(page, tagName);
});

test("Insights count what was applied to in a range, using back-dated entries", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const company = `Mike ${stamp}`;
  // A day of its own for each run, so the figures do not include what earlier runs left behind.
  const iso = (offset: number) => new Date(Date.UTC(1990, 0, 1 + (stamp % 9000) + offset)).toISOString().slice(0, 10);
  const applied = iso(0);
  await newApplication(page, company, "Analyst");
  await expect(page.locator("#posting-text")).toBeVisible();
  await page.getByLabel("Moved on").fill(applied);
  await page.getByRole("button", { name: "Applied", exact: true }).click();
  await expect(page.getByText(/^Applied /)).toBeVisible();
  await page.getByLabel("Date", { exact: true }).last().fill(iso(3));
  await page.getByRole("button", { name: "They replied" }).click();
  await expect(page.getByText("They replied").first()).toBeVisible();

  await page.goto(`/career/applications?view=insights&from=${applied}&to=${applied}`);
  const tile = (name: string) => page.getByRole("region", { name });
  await expect(tile("Applied to")).toContainText("1");
  await expect(tile("Reply rate")).toContainText("100%");
  await expect(tile("Reply rate")).toContainText("1 of 1 had a reply");
  await expect(tile("Median time to first reply")).toContainText("3 days");
  const funnel = page.getByRole("region", { name: "How far they got" });
  await expect(funnel.getByRole("listitem").filter({ hasText: "Applied" })).toContainText("1");
  await expect(funnel.getByRole("listitem").filter({ hasText: "Screening" })).toContainText("0");
  await expectNoViolations(page);

  // A range with nothing in it says so, and Clear dates brings the rest back.
  await page.getByLabel("From", { exact: true }).fill(iso(10));
  await page.getByLabel("To", { exact: true }).fill(iso(11));
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("No Applications were applied to in these dates.")).toBeVisible();
  await page.getByRole("link", { name: "Clear dates" }).click();
  await expect(tile("Applied to")).toBeVisible();
});

test("a Note's mention of an Application becomes a Backlink, and Search finds the Application by its posting", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const stamp = Date.now();
  const company = `Nova${stamp}`;
  const title = `Dev at ${company}`;
  const word = `zebrawrangler${stamp}`;
  await page.goto("/career/applications");
  await page.getByRole("button", { name: "New Application" }).click();
  const dialog = page.getByRole("dialog", { name: "New Application" });
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill("Dev");
  await dialog.getByLabel("Posting", { exact: true }).fill(`We need a ${word} who loves spreadsheets`);
  await dialog.getByRole("button", { name: "Add Application" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

  // A Note that only names the Application, then Link it from the Application's page.
  const noteTitle = `Nova note ${stamp}`;
  await newNote(page, noteTitle);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`Phone screen for ${title} went well`);
  await expectSaved(page);
  await page.goto("/career/applications");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  const section = page.getByRole("region", { name: /Mentioned without a Link/ });
  await expect(section.getByRole("link", { name: noteTitle })).toBeVisible();
  await section.getByRole("button", { name: `Link it in ${noteTitle}` }).click();
  await expect(page.getByRole("region", { name: "Backlinks" }).getByRole("link", { name: noteTitle })).toBeVisible();
  await expectNoViolations(page);

  // Search finds it by a word of the posting, and the type filter narrows to Applications.
  await page.goto(`/search?q=${word}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page.goto(`/search?q=${word}&type=NOTE`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
  await page.goto(`/search?q=${word}&type=APPLICATION`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await expectNoViolations(page);

  // The Graph has it as a node.
  await page.goto("/graph?type=APPLICATION");
  await expect(page.getByRole("link", { name: new RegExp(`^${title}, Application`) })).toBeVisible();

  await page.goto("/items");
  await trashRows(page, [noteTitle]);
});

test("the PDFs sent for an Application are uploaded with a label, downloaded and detached, and the Asset stays", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const stamp = Date.now();
  const company = `November ${stamp}`;
  const file = `cv-${stamp}.pdf`;
  const letter = `letter-${stamp}.pdf`;
  const pdf = (text: string) => ({ name: "", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4
${text}
%%EOF`) });
  await newApplication(page, company, "Dev");
  await expect(page.locator("#posting-text")).toBeVisible();
  const docs = page.getByRole("region", { name: "PDFs you sent" });
  await expect(docs).toContainText("Nothing attached yet.");

  // The label is chosen first; the file goes through the usual upload and is attached.
  await page.getByLabel("PDF file").setInputFiles({ ...pdf("resume"), name: file });
  await expect(docs.getByRole("link", { name: file })).toBeVisible();
  await expect(docs.getByRole("listitem").filter({ hasText: file })).toContainText("Resume");
  await docs.getByLabel("This PDF is a").selectOption("COVER_LETTER");
  await page.getByLabel("PDF file").setInputFiles({ ...pdf("cover"), name: letter });
  await expect(docs.getByRole("listitem").filter({ hasText: letter })).toContainText("Cover letter");
  await expectNoViolations(page);

  // Download gives the file; the Asset is in Assets too.
  const download = page.waitForEvent("download");
  await docs.getByRole("button", { name: `Download ${file}` }).click();
  expect((await download).suggestedFilename()).toBe(file);
  await page.goto("/assets");
  await expect(page.getByRole("link", { name: file }).first()).toBeVisible();

  // Detach takes it off the Application; the Asset stays.
  await page.goBack();
  await docs.getByRole("button", { name: `Detach ${file}` }).click();
  await expect(docs.getByRole("link", { name: file })).toHaveCount(0);
  await expect(docs.getByRole("link", { name: letter })).toBeVisible();
  await page.goto("/assets");
  await expect(page.getByRole("link", { name: file }).first()).toBeVisible();
});

test("an Application is added from a link: the page is read, typed fields are kept, and the link is stored", async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const company = `Oscar ${stamp}`;
  // A fake posting page on this machine. The API reads it only when it was started with
  // COREEX_POSTINGS_ALLOW_PRIVATE_HOSTS=true (it refuses every private address otherwise, which its own tests prove).
  const posting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Staff Engineer",
    hiringOrganization: { "@type": "Organization", name: company },
    jobLocation: { address: { addressLocality: "Lisbon", addressCountry: "PT" } },
    description: "<p>You will run the <b>platform</b>.</p><ul><li>Kubernetes</li></ul>",
  };
  const server = createServer((_, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<html><head><title>Jobs</title><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body>menu</body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const link = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/job?gh_jid=${stamp}`;
  try {
    await signIn(page);
    await page.goto("/career/applications");
    await page.getByRole("button", { name: "New Application" }).click();
    const dialog = page.getByRole("dialog", { name: "New Application" });
    await dialog.getByLabel("Role", { exact: true }).fill("My own role");
    await dialog.getByLabel("Link to the posting").fill(link);
    await dialog.getByRole("button", { name: "Read link" }).click();
    const outcome = dialog.getByRole("status").or(dialog.getByRole("alert"));
    await expect(outcome).toBeVisible();
    test.skip((await outcome.innerText()).includes("not a public address"), "The API was not started with COREEX_POSTINGS_ALLOW_PRIVATE_HOSTS=true");

    // What was empty is filled; what was typed stays.
    await expect(outcome).toContainText("Filled in Company, Location, Posting.");
    await expect(dialog.getByLabel("Company")).toHaveValue(company);
    await expect(dialog.getByLabel("Role", { exact: true })).toHaveValue("My own role");
    await expect(dialog.getByLabel("Location")).toHaveValue("Lisbon, PT");
    // A label that wraps a filled-in textarea takes the text into its name, so this one is found by name instead.
    await expect(dialog.locator('textarea[name="postingText"]')).toHaveValue(/You will run the platform\.\s+- Kubernetes/);
    await expectNoViolations(page);
    await dialog.getByRole("button", { name: "Add Application" }).click();

    await expect(page.getByRole("heading", { name: `My own role at ${company}`, level: 1 })).toBeVisible();
    await expect(page.getByLabel("Posting link")).toHaveValue(link);
    await expect(page.getByLabel("Location", { exact: true })).toHaveValue("Lisbon, PT");
    await expect(page.locator("#posting-text")).toHaveValue(/Kubernetes/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the same posting is refused with a pointer to the first, and a company that never answered is remembered", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const stamp = Date.now();
  const company = `Papa ${stamp}`;
  const link = `https://jobs.example.com/p/${stamp}?utm_source=a&gh_jid=${stamp}`;
  const add = async (name: string, url: string, ending: "open" | "refused") => {
    await page.goto("/career/applications");
    await page.getByRole("button", { name: "New Application" }).click();
    const dialog = page.getByRole("dialog", { name: "New Application" });
    await dialog.getByLabel("Link to the posting").fill(url);
    await dialog.getByLabel("Company").fill(name);
    await dialog.getByLabel("Role", { exact: true }).fill("Dev");
    await dialog.getByRole("button", { name: "Add Application" }).click();
    if (ending === "open") await expect(page).toHaveURL(/\/career\/applications\/[0-9a-f-]{36}$/);
    return dialog;
  };

  // The first goes in and is closed with no response.
  await add(company, link, "open");
  await page.getByRole("button", { name: "Closed", exact: true }).click();
  await page.getByLabel("Why did it close?").selectOption("NO_RESPONSE");
  await page.getByRole("button", { name: "Close Application" }).click();
  await expect(page.getByText("Closed: No response")).toBeVisible();

  // The same job by another link (www, a slash, other tracking) is refused, and the message points to the first.
  const dialog = await add(`Other ${stamp}`, `https://www.jobs.example.com/p/${stamp}/?gh_jid=${stamp}&utm_medium=b`, "refused");
  await expect(dialog.getByRole("alert")).toContainText("That posting is already tracked.");
  await expect(dialog.getByRole("alert").getByRole("link", { name: `Dev at ${company}` })).toBeVisible();
  await expectNoViolations(page);

  // The company is known by any case and spacing; the notice shows in the dialog and on the new page.
  await page.goto("/career/applications");
  await page.getByRole("button", { name: "New Application" }).click();
  const second = page.getByRole("dialog", { name: "New Application" });
  await second.getByLabel("Company").fill(`  papa   ${stamp} `);
  await second.getByLabel("Role", { exact: true }).fill("Lead");
  await expect(second.getByRole("note")).toContainText("before and never heard back");
  await expect(second.getByRole("note").getByRole("link", { name: `Dev at ${company}` })).toBeVisible();
  await second.getByRole("button", { name: "Add Application" }).click();
  await expect(page.getByRole("heading", { name: `Lead at papa   ${stamp}`.replace(/\s+/g, " "), level: 1 })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("You applied to");
  await expect(page.getByRole("note").getByRole("link", { name: `Dev at ${company}` })).toBeVisible();
  await expectNoViolations(page);
});

test("Fill with AI says what it sends, fills only empty fields, and leaves typed text alone", async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  await signIn(page);
  await page.goto("/career/applications");
  await page.getByRole("button", { name: "New Application" }).click();
  const dialog = page.getByRole("dialog", { name: "New Application" });
  const button = dialog.getByRole("button", { name: "Fill with AI" });

  // Without an AI key the dialog says the feature is coming soon, with no error; this run needs the fake provider.
  test.skip(await dialog.getByText("Fill with AI is coming soon").isVisible(), "The API was not started with COREEX_AI_PROVIDER=fake");

  // Nothing to read yet, so the button waits; the line above it says where the text goes.
  await expect(button).toBeDisabled();
  await expect(dialog.getByText(/sends the posting text above to Claude, made by Anthropic/)).toBeVisible();
  await expectNoViolations(page);

  // The API answers with fixed fields when started with COREEX_AI_PROVIDER=fake; without a key it says AI is off.
  await dialog.getByLabel("Role", { exact: true }).fill(`My own role ${stamp}`);
  await dialog.locator('textarea[name="postingText"]').fill(`Platform Engineer ${stamp}\nWe run the platform.`);
  await button.click();
  const outcome = dialog.getByRole("status").or(dialog.getByRole("alert"));
  await expect(outcome).toBeVisible();
  test.skip((await outcome.innerText()).includes("not switched on"), "The API was not started with COREEX_AI_PROVIDER=fake");

  await expect(outcome).toContainText("The AI filled in Company, Location.");
  await expect(dialog.getByLabel("Company")).toHaveValue("Fake Company");
  await expect(dialog.getByLabel("Role", { exact: true })).toHaveValue(`My own role ${stamp}`);
  await expect(dialog.getByLabel("Location")).toHaveValue("Fake City");
  await expect(dialog.locator('textarea[name="postingText"]')).toHaveValue(new RegExp(`^Platform Engineer ${stamp}`));
  await expectNoViolations(page);

  await dialog.getByRole("button", { name: "Add Application" }).click();
  await expect(page.getByRole("heading", { name: `My own role ${stamp} at Fake Company`, level: 1 })).toBeVisible();
});

test("Career opens from the rail with its panel and the Applications list, and New Application lands on the new page", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  await page.goto("/items");

  // The rail entry opens Career, which lands on Applications, and the entry shows as the current page.
  // On a Knowledge Base page the rail shows its panel, so Back brings the module list first.
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Back to the menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Career" }).click();
  await expect(page).toHaveURL(/\/career\/applications$/);
  await expect(page.getByRole("heading", { name: "Applications", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Career" })).toHaveAttribute("aria-current", "page");
  const panel = page.getByRole("navigation", { name: "Career" });
  await expect(panel.getByRole("link", { name: "Applications" })).toHaveAttribute("aria-current", "page");
  // Only Applications is live; the rest of the design's entries wait for their epics.
  await expect(panel.getByRole("link")).toHaveCount(1);
  await expectNoViolations(page);

  // A new Application lands on its page, keeps the Career panel, and is listed when you go back.
  await newApplication(page, `List ${stamp}`, "Designer");
  await expect(page.getByRole("navigation", { name: "Career" })).toBeVisible();
  await page.getByRole("navigation", { name: "Career" }).getByRole("link", { name: "Applications" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`^Designer at List ${stamp}`) })).toBeVisible();

  // Other modules do not get the panel.
  await page.goto("/trash");
  await expect(page.getByRole("navigation", { name: "Career" })).toHaveCount(0);
});

test("Resumes & Letters lists Resumes, and a Resume is created blank or with sample content, renamed and duplicated", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const blank = `Blank ${stamp}`;
  const sample = `Sample ${stamp}`;

  await page.goto("/career/library");
  await expect(page.getByRole("heading", { name: "Resumes & Letters", level: 1 })).toBeVisible();
  await expectNoViolations(page);

  const create = async (name: string, withSample: boolean) => {
    await page.getByRole("button", { name: "New Resume" }).click();
    const dialog = page.getByRole("dialog", { name: "New Resume" });
    await dialog.getByLabel("Name").fill(name);
    if (withSample) await dialog.getByLabel("Start with sample content").check();
    await dialog.getByRole("button", { name: "Create Resume" }).click();
    await expect(dialog).toHaveCount(0);
  };
  await create(blank, false);
  await create(sample, true);
  const rows = page.getByRole("list", { name: "Resumes" });
  await expect(rows.getByText(blank, { exact: true })).toBeVisible();
  await expect(rows.getByText(sample, { exact: true })).toBeVisible();
  await expectNoViolations(page);

  // Rename.
  await page.getByRole("button", { name: `Rename ${blank}` }).click();
  const rename = page.getByRole("dialog", { name: "Rename Resume" });
  await expectNoViolations(page);
  await rename.getByLabel("Name").fill(`Renamed ${stamp}`);
  await rename.getByRole("button", { name: "Save name" }).click();
  await expect(rows.getByText(`Renamed ${stamp}`, { exact: true })).toBeVisible();
  await expect(rows.getByText(blank, { exact: true })).toHaveCount(0);

  // Duplicate keeps the original and adds "(copy)".
  await page.getByRole("button", { name: `Duplicate ${sample}` }).click();
  await expect(rows.getByText(`${sample} (copy)`, { exact: true })).toBeVisible();
  await expect(rows.getByText(sample, { exact: true })).toBeVisible();

  // The Career panel keeps the entry, and it is the current page.
  await expect(page.getByRole("navigation", { name: "Career" }).getByRole("link", { name: "Resumes & Letters" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

// A new Resume made through the library, opened in its editor.
async function openNewResume(page: Page, name: string) {
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("textbox", { name: "Resume name" })).toHaveValue(name);
}

test("Resume downloads Word, Markdown and a JSON backup", async ({ page, context }) => {
  await signIn(page);
  await openNewResume(page, `Downloads ${Date.now()}`);
  await page.getByLabel("Name", { exact: true }).fill("Download Person");
  await page.getByRole("region", { name: "Private notes" }).locator("textarea").fill("private backup note");
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  const preview = page.getByRole("region", { name: "Page preview" });
  for (const [label, extension] of [["Word", "docx"], ["Markdown", "md"], ["JSON", "json"]] as const) {
    await preview.getByRole("button", { name: "Download", exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: `Download ${label}` }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    const bytes = await readFile(await download.path());
    if (extension === "docx") {
      const zip = await (await import("jszip")).default.loadAsync(bytes);
      const xml = await zip.file("word/document.xml")!.async("string");
      expect(xml).toContain("Download Person");
      expect(xml).not.toContain("private backup note");
    }
    else if (extension === "md") expect(bytes.toString()).toContain("Download Person");
    else expect(JSON.parse(bytes.toString()).privateNotes).toBe("private backup note");
  }
  await expectNoViolations(page);
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel("Name", { exact: true }).fill("Changed elsewhere");
  await expect(other.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await preview.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("menuitem", { name: "Download Markdown" }).click();
  await expect(preview.getByRole("alert")).toContainText("Could not download");
  await other.close();
});

test("the Resume editor saves contact details and the summary as you type, and shows Not saved with Retry when offline", async ({ page }) => {
  await signIn(page);
  const name = `Editor ${Date.now()}`;
  await openNewResume(page, name);
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });
  await expectNoViolations(page);

  await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
  await page.getByRole("textbox", { name: "Summary" }).fill("Builds engines.");
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Ada Lovelace");
  await expect(page.getByRole("textbox", { name: "Summary" })).toContainText("Builds engines.");

  // Offline: the save fails, and Retry saves once the connection is back.
  await page.context().setOffline(true);
  await page.getByLabel("Headline").fill("Analyst");
  await expect(status).toHaveText("Not saved");
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(status).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Headline")).toHaveValue("Analyst");
});

test("a save from another tab makes a (mine) copy and loads the stored Resume", async ({ page, context }) => {
  await signIn(page);
  const name = `Conflict ${Date.now()}`;
  await openNewResume(page, name);
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel("Name", { exact: true }).fill("Bee");
  const otherStatus = other.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });
  await expect(otherStatus).not.toHaveText("Saved");
  await expect(otherStatus).toHaveText("Saved");
  await other.close();

  await page.getByLabel("Headline").fill("Mine");
  await expect(page.getByText("This Resume was changed in another tab.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Bee");
  await expect(page.getByLabel("Headline")).toHaveValue("");
  await expectNoViolations(page);

  await page.goto("/career/library");
  await expect(page.getByRole("list", { name: "Resumes" }).getByText(`${name} (mine)`, { exact: true })).toBeVisible();
});

test("text typed but not saved before the tab closed is offered again on reopening", async ({ page, context }) => {
  await signIn(page);
  await openNewResume(page, `Recover ${Date.now()}`);
  const url = page.url();
  await context.setOffline(true);
  await page.getByLabel("Headline").fill("Unsaved headline");
  await expect(page.getByRole("status").filter({ hasText: "Not saved" })).toBeVisible();
  await page.close();
  await context.setOffline(false);

  const again = await context.newPage();
  await again.goto(url);
  await expect(again.getByText("Unsaved text from your last visit was put back.")).toBeVisible();
  await expect(again.getByLabel("Headline")).toHaveValue("Unsaved headline");
});

test("the Resume preview shows the page at real size, follows typing, zooms, and downloads the same PDF", async ({ page }) => {
  await signIn(page);
  const name = `Preview ${Date.now()}`;
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name }).click();

  const preview = page.getByRole("region", { name: "Page preview" });
  const sheet = preview.getByRole("img", { name: "Page 1 of 1" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  // The page opens fitted to the width of its column; Reset zoom goes to 100%, where A4 is 595 points wide, about 794 CSS pixels.
  await preview.getByRole("button", { name: "Reset zoom" }).click();
  await expect(preview.getByRole("button", { name: "Reset zoom" })).toHaveText("100%");
  const before = (await sheet.boundingBox())!;
  expect(Math.round(before.width)).toBeGreaterThan(780);
  expect(Math.round(before.width)).toBeLessThan(810);
  await expectNoViolations(page);

  // Typing changes the page without waiting for it: the field answers at once, the page follows.
  const status = preview.getByRole("status");
  await page.getByLabel("Name", { exact: true }).fill("Grace Hopper");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Grace Hopper");
  await expect(status).toHaveText("1 page", { timeout: 30_000 });

  await preview.getByRole("button", { name: "Zoom in" }).click();
  await expect(preview.getByRole("button", { name: "Reset zoom" })).toHaveText("125%");
  await expect(async () => {
    expect((await preview.getByRole("img", { name: "Page 1 of 1" }).boundingBox())!.width).toBeGreaterThan(before.width * 1.2);
  }).toPass();
  await preview.getByRole("button", { name: "Reset zoom" }).click();

  // The download is a PDF named after the Resume, with real text in it.
  await preview.getByRole("button", { name: "Download", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download PDF" }).click()]);
  expect(download.suggestedFilename()).toBe(`${name}.pdf`);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.byteLength).toBeGreaterThan(5000);
});

test("sections and entries are added, reordered, hidden and printed in one date format, and they survive a reload", async ({ page }) => {
  await signIn(page);
  await openNewResume(page, `Sections ${Date.now()}`);
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });

  // A section of a chosen kind starts with that kind's name.
  await page.getByRole("button", { name: "Add section" }).click();
  const experience = page.getByRole("region", { name: "Experience", exact: true });
  await experience.getByRole("button", { name: "Add an entry" }).click();
  await experience.getByRole("button", { name: "Add an entry" }).click();
  const rows = experience.getByRole("list", { name: "Entries of Experience" }).getByRole("listitem").filter({ has: page.getByLabel("Title", { exact: true }) });
  await rows.nth(0).getByLabel("Title", { exact: true }).fill("Engineer");
  await rows.nth(1).getByLabel("Title", { exact: true }).fill("Designer");
  await rows.nth(0).getByLabel("Start").fill("2021-03");
  await rows.nth(0).getByLabel("Present").check();
  await rows.nth(0).getByRole("button", { name: "Add a role" }).click();
  await rows.nth(0).getByLabel("Role title").fill("Lead");
  await expectNoViolations(page);

  // A second section, of another kind, goes below; the date format is one setting for the whole Resume.
  await page.getByLabel("Kind of section").selectOption("EDUCATION");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("region", { name: "Education", exact: true })).toBeVisible();
  await page.getByLabel("Date format").selectOption("MM_YYYY");

  // Reorder an entry with its buttons, hide the other, and move the Education section above Experience.
  await page.getByRole("button", { name: "Move Designer up" }).click();
  await expect(rows.nth(0).getByLabel("Title", { exact: true })).toHaveValue("Designer");
  await page.getByRole("button", { name: "Hide Engineer" }).click();
  await page.getByRole("button", { name: "Move Education up" }).click();
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");

  await page.reload();
  const names = page.getByRole("textbox", { name: "Section name" });
  await expect(names.nth(0)).toHaveValue("Education");
  await expect(names.nth(1)).toHaveValue("Experience");
  // Entries come back as one line each after a reload: open them to read their fields.
  const listed = page.getByRole("region", { name: "Experience", exact: true }).getByRole("list", { name: "Entries of Experience" }).getByRole("listitem");
  await listed.nth(0).getByRole("button", { name: /^Designer/ }).click();
  await listed.nth(1).getByRole("button", { name: /^Engineer/ }).click();
  const again = listed.filter({ has: page.getByLabel("Title", { exact: true }) });
  await expect(again.nth(0).getByLabel("Title", { exact: true })).toHaveValue("Designer");
  await expect(again.nth(1).getByLabel("Title", { exact: true })).toHaveValue("Engineer");
  await expect(page.getByRole("button", { name: "Show Engineer" })).toBeVisible();
  await expect(again.nth(1).getByLabel("Present").first()).toBeChecked();
  await expect(page.getByLabel("Date format")).toHaveValue("MM_YYYY");
  await expectNoViolations(page);
});

test("Undo takes back a whole typed sentence in one step, and Redo puts it back; a delete offers Undo", async ({ page }) => {
  await signIn(page);
  await openNewResume(page, `Undo ${Date.now()}`);
  const headline = page.getByLabel("Headline");
  await headline.pressSequentially("Staff engineer");
  await expect(headline).toHaveValue("Staff engineer");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(headline).toHaveValue("");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(headline).toHaveValue("Staff engineer");
  // The keys do the same.
  await headline.press("Control+z");
  await expect(headline).toHaveValue("");

  // A deleted section can be brought back from the toast.
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Remove Experience" }).click();
  await expect(page.getByRole("region", { name: "Experience", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect(page.getByRole("region", { name: "Experience", exact: true })).toBeVisible();
});

test("a locked Resume cannot be edited until unlocked, and private notes are kept", async ({ page }) => {
  await signIn(page);
  await openNewResume(page, `Lock ${Date.now()}`);
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });

  await page.getByLabel("Only you see these").fill("Sent to Acme on Monday");
  await page.getByLabel("Headline").fill("Analyst");
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");

  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByText("This Resume is locked.")).toBeVisible();
  await expect(page.getByLabel("Headline")).toBeDisabled();
  await expectNoViolations(page);
  await page.reload();
  await expect(page.getByLabel("Headline")).toBeDisabled();
  await expect(page.getByLabel("Only you see these")).toHaveValue("Sent to Acme on Monday");

  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByLabel("Headline")).toBeEnabled();
  await page.getByLabel("Headline").fill("Senior analyst");
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");
});

test("a click on the page jumps to that field in the editor, on page 1 and on page 2", async ({ page }) => {
  await signIn(page);
  const name = `Map ${Date.now()}`;
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name }).click();
  const preview = page.getByRole("region", { name: "Page preview" });
  await expect(preview.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });

  // The name on the page is the name field.
  await preview.locator('[data-page="1"] [data-ref="basics.name"]').click();
  await expect(page.locator(":focus")).toHaveAttribute("data-field", "basics.name");

  // Copies of the first job push the Resume onto a second page.
  const experience = page.getByRole("region", { name: "Experience", exact: true });
  for (let i = 0; i < 12; i++) await experience.getByRole("button", { name: "Duplicate Senior Software Engineer" }).first().click();
  await expect(preview.getByRole("status")).toHaveText("2 pages", { timeout: 30_000 });
  await expectNoViolations(page);

  const onSecond = preview.locator('[data-page="2"] [data-ref$=":title"]').first();
  const ref = await onSecond.getAttribute("data-ref");
  expect(ref).toMatch(/^entry:.+:title$/);
  await onSecond.click();
  await expect(page.locator(":focus")).toHaveAttribute("data-field", ref!);
});

test("Design mode shows each template with the Resume's own content, previews one, and applies it", async ({ page }) => {
  await signIn(page);
  const name = `Templates ${Date.now()}`;
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name }).click();
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });

  await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
  const gallery = page.getByRole("list", { name: "Templates" });
  for (const label of ["Classic", "Sidebar", "Modern"]) {
    await expect(gallery.getByRole("img", { name: `${label} template with your content` })).toBeVisible({ timeout: 30_000 });
  }
  await expectNoViolations(page);

  // Looking at a template changes the page preview but not the Resume.
  await gallery.getByRole("button", { name: "Preview Modern" }).click();
  await expect(gallery.getByRole("button", { name: "Use this template" })).toBeVisible();
  await gallery.getByRole("button", { name: "Cancel" }).click();
  await expect(gallery.getByRole("button", { name: "Use this template" })).toHaveCount(0);
  await expect(status).toHaveText("Saved");

  await gallery.getByRole("button", { name: "Preview Sidebar" }).click();
  await gallery.getByRole("button", { name: "Use this template" }).click();
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");
  await expect(gallery.getByText("In use")).toHaveCount(1);

  // The choice is saved, and a click on the page still finds its field in the two-column layout.
  await page.reload();
  await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
  await expect(page.getByRole("list", { name: "Templates" }).getByRole("listitem").filter({ hasText: "In use" })).toContainText("Sidebar");
  const preview = page.getByRole("region", { name: "Page preview" });
  await expect(preview.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });
  await preview.locator('[data-page="1"] [data-ref^="section:"]').first().click();
  await expect(page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Write" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(":focus")).toHaveAttribute("data-field", /^section:/);
});

test("the design controls change the page, warn about a hard-to-read accent, move a section to page 2, and reset", async ({ page }) => {
  await signIn(page);
  const name = `Design ${Date.now()}`;
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name }).click();
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });
  const preview = page.getByRole("region", { name: "Page preview" });
  await expect(preview.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
  await expectNoViolations(page);

  // A different page size changes the page: Letter is wider than a point, not a pixel, away from A4 (794 px at 100%).
  const width = async () => Math.round((await preview.getByRole("img", { name: /^Page 1 of/ }).boundingBox())!.width);
  expect(await width()).toBeGreaterThan(790);
  await page.getByLabel("Page size").selectOption("LETTER");
  await expect.poll(width, { timeout: 30_000 }).toBeGreaterThan(810);

  // Text size and the two-column entries change the page too (the page count is the same, the layout is not).
  await page.getByLabel("Text size (pt)").fill("14");
  await page.getByLabel("Entries in columns").selectOption("2");
  await page.getByLabel("Heading font").selectOption("Times");
  await expect(preview.getByRole("status")).toHaveText(/pages?$/, { timeout: 30_000 });

  // A pale accent shows a warning; the default one does not.
  await expect(page.getByText(/easy to read/)).toBeVisible();
  await page.getByLabel("Accent colour").fill("#ffe066");
  await expect(page.getByText(/Hard to read: contrast/)).toBeVisible();

  // A section placed on page 2 makes a second page.
  await page.getByLabel("Page of Education").selectOption("2");
  await expect(preview.getByRole("img", { name: "Page 2 of 2" })).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('[data-page="2"] [data-ref="section:education"]')).toHaveCount(1);
  // "Saved" only shows when what is saved is what is on screen.
  await expect(status).toHaveText("Saved");

  // The settings are saved; Reset brings back the template's look, and it is one Undo step.
  await page.reload();
  await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
  await expect(page.getByLabel("Page size")).toHaveValue("LETTER");
  await expect(page.getByLabel("Text size (pt)")).toHaveValue("14");
  await page.getByRole("button", { name: "Reset to template defaults" }).click();
  await expect(page.getByLabel("Page size")).toHaveValue("A4");
  await expect(page.getByLabel("Text size (pt)")).toHaveValue("10");
  await expect(page.getByLabel("Page of Education")).toHaveValue("1");
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Page size")).toHaveValue("LETTER");
});

test("an overflowing Resume is fitted back onto its page in one Undo step, a hopeless one is left alone, and Add a page accepts it", async ({ page }) => {
  await signIn(page);
  const name = `Fit ${Date.now()}`;
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name }).click();
  const preview = page.getByRole("region", { name: "Page preview" });
  await expect(preview.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });
  const overflow = preview.getByText("This Resume runs onto page 2.");
  await expect(overflow).toHaveCount(0);

  // A little too long: Fit to page squeezes it back onto one page, and names what it changed.
  const experience = page.getByRole("region", { name: "Experience", exact: true });
  for (let i = 0; i < 8; i++) await experience.getByRole("button", { name: "Duplicate Senior Software Engineer" }).first().click();
  await expect(overflow).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(page);
  await preview.getByRole("button", { name: "Fit to page" }).click();
  await expect(page.getByText(/^Fitted to one page: /)).toBeVisible({ timeout: 60_000 });
  await expect(preview.getByRole("status").filter({ hasText: /pages?$/ })).toHaveText("1 page", { timeout: 30_000 });
  await expect(overflow).toHaveCount(0);

  // One Undo brings the settings (and the overflow) back.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(overflow).toBeVisible({ timeout: 30_000 });

  // Far too long: Fit to page says it cannot, and the settings are as they were.
  for (let i = 0; i < 30; i++) await experience.getByRole("button", { name: "Duplicate Senior Software Engineer" }).first().click();
  await preview.getByRole("button", { name: "Fit to page" }).click();
  await expect(page.getByText(/does not fit on one page/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
  await expect(page.getByLabel("Text size (pt)")).toHaveValue("10");
  await expect(page.getByLabel("Density")).toHaveValue("comfortable");

  // Add a page accepts the overflow: the message goes.
  await preview.getByRole("button", { name: "Add a page" }).click();
  await expect(overflow).toHaveCount(0, { timeout: 30_000 });
});

test("a photo is uploaded as an Asset, reaches the PDF, changes its frame, survives a reload and is removed", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const name = `Photo ${stamp}`;
  await openNewResume(page, name);
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });
  const preview = page.getByRole("region", { name: "Page preview" });
  await expect(preview.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });

  // The downloaded PDF has an image in it only while there is a photo.
  const hasImage = async () => {
    await preview.getByRole("button", { name: "Download", exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download PDF" }).click()]);
    const { readFile } = await import("node:fs/promises");
    return /\/Subtype\s*\/Image/.test((await readFile(await download.path())).toString("latin1"));
  };
  expect(await hasImage()).toBe(false);

  // Uploading makes an Asset, and the photo is that Asset.
  await page.getByLabel("Upload a photo").setInputFiles({ name: `me-${stamp}.png`, mimeType: "image/png", buffer: PIXEL });
  await expect(page.getByRole("img", { name: "Your photo" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Choose from your Assets")).toHaveValue(/.+/);
  await expect(status).toHaveText("Saved");
  await expect.poll(hasImage, { timeout: 30_000 }).toBe(true);
  await expectNoViolations(page);

  // The frame and crop are settings of the Resume.
  await page.getByLabel("Shape").selectOption("square");
  await page.getByLabel("Size (pt)").fill("120");
  await page.getByLabel("Zoom (%)").fill("150");
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("img", { name: "Your photo" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Shape")).toHaveValue("square");
  await expect(page.getByLabel("Size (pt)")).toHaveValue("120");

  // Hiding it takes it off the page; the Resume still names the Asset. Remove forgets it.
  await page.getByLabel("Show the photo on the page").uncheck();
  await expect.poll(hasImage, { timeout: 30_000 }).toBe(false);
  await page.getByLabel("Show the photo on the page").check();
  await expect.poll(hasImage, { timeout: 30_000 }).toBe(true);
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("img", { name: "Your photo" })).toHaveCount(0);
  await expect.poll(hasImage, { timeout: 30_000 }).toBe(false);
});

test("the library searches and sorts Resumes, draws their first page, files them in a Folder and Tags, and trashes and restores them", async ({ page }) => {
  await signIn(page);
  const stamp = Date.now();
  const folderName = `Resume folder ${stamp}`;
  const tagName = `resume-probe-${stamp}`;
  const [beta, alpha, gamma] = [`Beta ${stamp}`, `Alpha ${stamp}`, `Gamma ${stamp}`];
  await page.goto("/items");
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(folderName);
  await page.getByRole("button", { name: "Create Folder" }).click();

  const make = async (name: string, sample: boolean) => {
    await page.goto("/career/library");
    await page.getByRole("button", { name: "New Resume" }).click();
    const dialog = page.getByRole("dialog", { name: "New Resume" });
    await dialog.getByLabel("Name").fill(name);
    if (sample) await dialog.getByLabel("Start with sample content").check();
    await dialog.getByRole("button", { name: "Create Resume" }).click();
    await expect(dialog).toHaveCount(0);
  };
  await make(beta, false);
  await make(alpha, true);
  await make(gamma, false);

  // Search by title, and sort by name.
  await page.goto("/career/library");
  await page.getByLabel("Search by title").fill(stamp.toString());
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=/);
  const list = page.getByRole("list", { name: "Resumes" });
  await page.getByRole("navigation", { name: "Sort" }).getByRole("link", { name: "Name" }).click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(list.getByRole("link")).toHaveText([alpha, beta, gamma]);
  await page.getByLabel("Search by title").fill(`ALPHA ${stamp}`);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(list.getByRole("link")).toHaveText([alpha]);

  // The card shows the Resume's first page, drawn (the sample Resume has text, so it is not blank).
  // The canvas is hidden until the page is drawn, so it is found by its label rather than by role.
  const first = page.locator(`canvas[aria-label="First page of ${alpha}"]`);
  await expect(first).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  expect(await first.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) ink++;
    return ink;
  })).toBeGreaterThan(100);
  await expectNoViolations(page);

  // The list view keeps the search and drops the pictures.
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.locator(`canvas[aria-label="First page of ${alpha}"]`)).toHaveCount(0);
  await expect(list.getByRole("link")).toHaveText([alpha]);

  // A Folder and a Tag, set on the Resume's page (a Resume is an Item).
  await list.getByRole("link", { name: alpha }).click();
  // The Folder, Tags and Backlinks are folded under Details until asked for.
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const organise = page.getByRole("region", { name: "Folder and Tags" });
  await expect(page.getByRole("heading", { name: "Backlinks" })).toBeVisible();
  await chooseFolder(page, organise, "Folder", folderName);
  await organise.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByPlaceholder("Find or create a Tag").fill(tagName);
  await page.getByRole("option", { name: `Create “${tagName}”` }).click();
  await expect(organise.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName })).toBeVisible();
  await expectNoViolations(page);

  // The Tag shows on its card, and the Folder lists the Resume and opens its page.
  await page.goto(`/career/library?q=${alpha}`);
  await expect(page.getByRole("list", { name: `Tags of ${alpha}` })).toContainText(tagName);
  await page.goto("/items");
  await page.getByRole("link", { name: folderName }).first().click();
  const listed = page.getByRole("main").getByRole("link", { name: alpha }).first();
  await expect(listed).toHaveAttribute("href", /^\/career\/resumes\//);
  await page.goto((await listed.getAttribute("href"))!);
  await expect(page.getByRole("textbox", { name: "Resume name" })).toHaveValue(alpha);

  // Move to Trash with Undo, then for good enough to see the Trash: Restore brings it back.
  await page.goto(`/career/library?q=${alpha}`);
  await page.getByRole("button", { name: `Move to Trash: ${alpha}` }).click();
  await expect(page.getByText(`Moved “${alpha}” to the Trash`)).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(list.getByRole("link", { name: alpha })).toBeVisible();
  await page.getByRole("button", { name: `Move to Trash: ${alpha}` }).click();
  await expect(list.getByRole("link", { name: alpha })).toHaveCount(0);
  await page.goto("/trash");
  const row = page.getByRole("row").filter({ hasText: alpha });
  await expect(row).toContainText("Resume");
  await expectNoViolations(page);
  await row.getByRole("button", { name: `Restore ${alpha}` }).click();
  await expect(page.getByText(`Restored "${alpha}"`)).toBeVisible();
  await page.goto(`/career/library?q=${alpha}`);
  await expect(list.getByRole("link", { name: alpha })).toBeVisible();
});

test("History keeps earlier versions: one is named, looked at in the preview without changing the Resume, and restored", async ({ page }) => {
  await signIn(page);
  await openNewResume(page, `History ${Date.now()}`);
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });
  const mode = page.getByRole("navigation", { name: "Mode" });
  const name = page.getByLabel("Name", { exact: true });

  await name.fill("Ada One");
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");

  // Nothing was replaced yet that is worth keeping; naming keeps the Resume as it is now, for good.
  await mode.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("No earlier versions yet.")).toBeVisible();
  await page.getByLabel("Name this version").fill("First draft");
  await page.getByRole("button", { name: "Keep as a named version" }).click();
  const versions = page.getByRole("list", { name: "Versions" });
  await expect(versions.getByRole("button", { name: /First draft/ })).toBeVisible();
  await expectNoViolations(page);

  // The Resume changes.
  await mode.getByRole("button", { name: "Write" }).click();
  await name.fill("Ada Two");
  await expect(status).not.toHaveText("Saved");
  await expect(status).toHaveText("Saved");

  // Looking at the named version changes nothing, and Stop looking drops it.
  await mode.getByRole("button", { name: "History" }).click();
  await versions.getByRole("button", { name: /First draft/ }).click();
  await expect(page.getByText("Looking at “First draft” in the page preview.")).toBeVisible();
  await page.getByRole("button", { name: "Stop looking" }).click();
  await expect(page.getByText(/Looking at/)).toHaveCount(0);
  await mode.getByRole("button", { name: "Write" }).click();
  await expect(name).toHaveValue("Ada Two");

  // Restoring brings back exactly that document, and keeps the one it replaced.
  await mode.getByRole("button", { name: "History" }).click();
  await versions.getByRole("button", { name: /First draft/ }).click();
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.getByText("The version is back.")).toBeVisible();
  await expect(mode.getByRole("button", { name: "Write" })).toHaveAttribute("aria-current", "page");
  await expect(name).toHaveValue("Ada One");
  await mode.getByRole("button", { name: "History" }).click();
  await expect(versions.getByRole("listitem")).toHaveCount(2);
  // The older "Ada Two" is the one that was kept: restoring it gets it back.
  await versions.getByRole("listitem").filter({ hasNotText: "First draft" }).getByRole("button").click();
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(name).toHaveValue("Ada Two");
});

test("custom style rules change the page, bad ones are explained and not saved, and a part is picked on the page", async ({ page }) => {
  await signIn(page);
  const name = `Style ${Date.now()}`;
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start with sample content").check();
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name }).click();
  const status = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Not saved)$/ });
  const preview = page.getByRole("region", { name: "Page preview" });
  await expect(preview.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
  const rules = page.getByLabel("Custom style rules");
  const heading = preview.locator('[data-page="1"] [data-ref^="section:"]').first();
  const height = async () => (await heading.boundingBox())!.height;
  const before = await height();

  // A rule changes the page: the heading is bigger.
  await rules.fill("heading { font-size: 20 }");
  await expect.poll(height, { timeout: 30_000 }).toBeGreaterThan(before * 1.3);
  await expect(status).toHaveText("Saved");
  await expectNoViolations(page);

  // A rule that cannot be drawn is explained, and the page keeps the last good one.
  await rules.fill("heading { position: fixed }");
  await expect(page.getByRole("alert", { name: "Problems with the custom style" })).toContainText('"position" is not a property you can set.');
  await page.reload();
  await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
  await expect(page.getByLabel("Custom style rules")).toHaveValue("heading { font-size: 20 }");

  // Picking a part on the page starts a rule for it, with the cursor in the rules.
  await page.getByRole("button", { name: "Pick a part on the page" }).click();
  await expect(page.getByRole("button", { name: "Click a part on the page…" })).toHaveAttribute("aria-pressed", "true");
  await expect(preview.getByRole("img", { name: "Page 1 of 1" })).toBeVisible({ timeout: 30_000 });
  await preview.locator('[data-page="1"] [data-ref="basics.name"]').click();
  await expect(page.getByLabel("Custom style rules")).toHaveValue(/name \{\s*\}/);
  await expect(page.getByLabel("Custom style rules")).toBeFocused();
  await expect(page.getByRole("button", { name: "Pick a part on the page" })).toHaveAttribute("aria-pressed", "false");
});
