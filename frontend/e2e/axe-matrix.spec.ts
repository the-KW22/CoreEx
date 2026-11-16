import { expect, test, type Browser, type Page } from "@playwright/test";

import { PIXEL, expectNoViolations, expectSaved, newApplication, newNote, openPalette, signIn, trashRows } from "./helpers";

// The whole UI against WCAG 2.2 AA (docs/DESIGN.md section 10): every main screen and every open state, in both
// themes, at desktop width and at 375px. The data is seeded once and tidied up at the end. Run one cell while
// working, e.g. `npx playwright test axe-matrix -g "dark desktop"`; the whole matrix is for before a release.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const word = `mx${stamp}`;
const noteA = `Matrix target ${word}`;
const noteB = `Matrix source ${word}`;
const trashed = `Matrix trashed ${word}`;
const folderName = `Matrix folder ${word}`;
const tagName = `matrix-${word}`;
const invited = `matrix-${word}@example.com`;

const seed = { note: "", asset: "", folder: "", tag: "", application: "", resume: "" };
let seedPage: Page;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  // Its own desktop context, whatever cell runs first: on a phone the Tag editor sits in a Sheet.
  seedPage = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" })).newPage();
  const page = seedPage;
  await signIn(page);

  // New Folder is the plus button of the Knowledge Base panel's Folders tab; Home has no panel.
  await page.goto("/items");
  await page.getByRole("radio", { name: "Folders" }).click();
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.getByLabel("Folder name").fill(folderName);
  await page.getByRole("button", { name: "Create Folder" }).click();

  // A tagged Note with a word in its body, and a second Note that links to it.
  await newNote(page, noteA);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`The first line about ${word}.`);
  await expectSaved(page);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByPlaceholder("Find or create a Tag").fill(tagName);
  await page.getByRole("option", { name: `Create “${tagName}”` }).click();
  await expect(page.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName })).toBeVisible();
  seed.note = new URL(page.url()).pathname;

  await newNote(page, noteB);
  await page.getByRole("textbox", { name: "Note content" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`See [[${noteA}`);
  await page.getByRole("option", { name: new RegExp(noteA) }).click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Linked.");
  await expectSaved(page);

  // An image, and a Note in the Trash.
  await page.goto("/items");
  await page.getByRole("button", { name: "Upload", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload files" });
  const image = `matrix-${word}.png`;
  await dialog.getByLabel("Choose files").setInputFiles({ name: image, mimeType: "image/png", buffer: PIXEL });
  await dialog.getByRole("link", { name: image }).click();
  await expect(page).toHaveURL(/\/assets\//);
  seed.asset = new URL(page.url()).pathname;

  // An Application cannot go to the Trash yet (#239), so this one stays behind.
  await newApplication(page, `Matrix ${word}`, "Engineer");
  seed.application = new URL(page.url()).pathname;

  // A Resume cannot go to the Trash yet (#255), so this one stays behind.
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume" }).click();
  const made = page.getByRole("dialog", { name: "New Resume" });
  await made.getByLabel("Name").fill(`Matrix ${word}`);
  await made.getByRole("button", { name: "Create Resume" }).click();
  await page.getByRole("link", { name: `Matrix ${word}` }).click();
  await expect(page).toHaveURL(/\/career\/resumes\//);
  seed.resume = new URL(page.url()).pathname;

  await newNote(page, trashed);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page).toHaveURL(/\/items$/);

  await page.goto("/items");
  seed.folder = (await page.getByRole("main").getByRole("link", { name: folderName }).getAttribute("href")) ?? "";
  await page.goto("/tags");
  seed.tag = (await page.getByRole("main").getByRole("link", { name: tagName }).getAttribute("href")) ?? "";

  // A pending Invite, for the Revoke confirm.
  await page.goto("/admin");
  await page.getByLabel("Email to invite").fill(invited);
  await page.getByRole("button", { name: "Create Invite" }).click();
  await expect(page.getByRole("row").filter({ hasText: invited })).toContainText("Pending");
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  const page = seedPage;
  // The Invite, the Tag, the Folder, then every Note and the image through the Trash.
  await page.goto("/admin");
  await page.getByRole("row").filter({ hasText: invited }).getByRole("button", { name: /^Revoke/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await page.goto("/tags");
  await page.getByRole("button", { name: `Delete ${tagName}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete Tag" }).click();
  await page.goto(seed.folder);
  await page.getByRole("button", { name: `Move ${folderName} to Trash` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move Folder to Trash" }).click();
  await trashRows(page, [noteA, noteB, `matrix-${word}.png`]);
  await page.goto("/trash");
  for (const title of [noteA, noteB, `matrix-${word}.png`, trashed, folderName]) {
    const row = page.getByRole("row").filter({ hasText: title });
    if ((await row.count()) === 0) continue;
    await row.getByRole("button", { name: `Delete forever: ${title}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
    await expect(row).toHaveCount(0);
  }
  await page.context().close();
});

// Scans the page as it is and remembers what failed, so one run lists every problem rather than the first.
async function scan(page: Page, failures: string[], label: string) {
  try {
    await expectNoViolations(page);
  } catch (error) {
    failures.push(`${label}: ${String((error as Error).message).replace(/\s+/g, " ").slice(0, 500)}`);
  }
  if (process.env.SHOTS) {
    await page.screenshot({ path: `test-results/screens/${test.info().title.replace(/\W+/g, "-")}-${label.replace(/\W+/g, "-")}.png` });
  }
}

// A screen, by address, with a heading or landmark that shows once it is ready.
async function screen(page: Page, failures: string[], label: string, path: string, ready: () => Promise<void>) {
  await page.goto(path);
  await ready();
  await scan(page, failures, label);
}

async function signedOutScreens(browser: Browser, colorScheme: "dark" | "light", viewport: { width: number; height: number }, failures: string[]) {
  const context = await browser.newContext({ colorScheme, viewport });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to CoreEx", level: 1 })).toBeVisible();
  await scan(page, failures, "sign in");
  await context.close();
}

for (const colorScheme of ["dark", "light"] as const) {
  for (const [size, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["phone", { width: 375, height: 812 }],
  ] as const) {
    test.describe(`${colorScheme} ${size}`, () => {
      test(`matrix: ${colorScheme} ${size}`, async ({ browser }) => {
        test.setTimeout(240_000);
        const context = await browser.newContext({ colorScheme, viewport, storageState: await seedPage.context().storageState() });
        const page = await context.newPage();
        const phone = size === "phone";
        const failures: string[] = [];
        const heading = (name: string, level = 1) => async () => {
          await expect(page.getByRole("heading", { name, level, exact: true }).first()).toBeVisible();
        };

        await signedOutScreens(browser, colorScheme, viewport, failures);

        // Screens.
        await screen(page, failures, "home", "/", async () => {
          await expect(page.getByRole("status").filter({ hasText: "Loading your Home" })).toHaveCount(0);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        });
        await screen(page, failures, "all items", "/items", heading("All Items"));
        await screen(page, failures, "folder", seed.folder, heading(folderName));
        await screen(page, failures, "tag", seed.tag, heading(tagName));
        await screen(page, failures, "tags", "/tags", heading("Tags"));
        await screen(page, failures, "note", seed.note, async () => {
          await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(noteA);
        });
        await screen(page, failures, "applications", "/career/applications", heading("Applications"));
        await screen(page, failures, "resumes library", "/career/library", heading("Resumes & Letters"));
        await screen(page, failures, "resumes library list", "/career/library?view=list", heading("Resumes & Letters"));
        await screen(page, failures, "applications needs you", "/career/applications?needs=1", heading("Applications"));
        await screen(page, failures, "applications board", "/career/applications?view=board", heading("Applications"));
        await screen(page, failures, "applications calendar", "/career/applications?view=calendar", heading("Applications"));
        await screen(page, failures, "applications insights", "/career/applications?view=insights", heading("Applications"));
        await screen(page, failures, "applications bulk bar", "/career/applications", async () => {
          await page.getByRole("checkbox", { name: /^Select / }).first().click();
          await expect(page.getByRole("region", { name: "Bulk actions" })).toBeVisible();
        });
        await screen(page, failures, "application", seed.application, async () => {
          await expect(page.getByRole("heading", { name: `Engineer at Matrix ${word}`, level: 1 })).toBeVisible();
        });
        await screen(page, failures, "resume", seed.resume, async () => {
          await expect(page.getByRole("textbox", { name: "Resume name" })).toHaveValue(`Matrix ${word}`);
        });
        await screen(page, failures, "resume design", seed.resume, async () => {
          await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "Design" }).click();
          await expect(page.getByRole("heading", { name: "Template", level: 2 })).toBeVisible();
        });
        await screen(page, failures, "resume history", seed.resume, async () => {
          await page.getByRole("navigation", { name: "Mode" }).getByRole("button", { name: "History" }).click();
          await expect(page.getByRole("heading", { name: "History", level: 2 })).toBeVisible();
        });
        await screen(page, failures, "asset", seed.asset, async () => {
          await expect(page.getByRole("img", { name: `matrix-${word}.png` })).toBeVisible();
        });
        await screen(page, failures, "assets", "/assets", heading("Assets"));
        await screen(page, failures, "graph", "/graph", async () => {
          await expect(page.getByRole("link", { name: new RegExp(`^${noteB}, Note`) })).toBeVisible();
        });
        await screen(page, failures, "graph tree", "/graph?mode=tree", async () => {
          await expect(page.getByRole("link", { name: new RegExp(`^${noteB}, Note`) })).toBeVisible();
        });
        await screen(page, failures, "graph coloured", "/graph?colour=tag", async () => {
          await expect(page.getByRole("list", { name: "Colours" })).toBeVisible();
        });
        await screen(page, failures, "graph insights", "/graph", async () => {
          const opener = page.getByRole("button", { name: "Insights" }).locator("visible=true");
          await opener.click();
          await expect(page.getByRole("heading", { name: "Most linked" }).locator("visible=true")).toBeVisible();
        });
        await page.keyboard.press("Escape");
        await screen(page, failures, "graph find", "/graph", async () => {
          await page.getByRole("combobox", { name: "Find an Item in the graph" }).fill(word);
          await expect(page.getByRole("option", { name: noteB })).toBeVisible();
        });
        await screen(page, failures, "trash", "/trash", heading("Trash"));
        await screen(page, failures, "search", `/search?q=${word}`, async () => {
          await expect(page.locator("main mark").first()).toBeVisible();
        });
        await screen(page, failures, "admin overview", "/admin/overview", heading("Where the storage goes", 2));
        await screen(page, failures, "admin users", "/admin/users", heading("Admin"));
        await screen(page, failures, "admin invites", "/admin", heading("Admin"));
        await screen(page, failures, "access tokens", "/settings/tokens", heading("Access tokens"));
        await screen(page, failures, "mcp guide", "/help/mcp", heading("Connect an Agent"));
        await screen(page, failures, "export", "/settings/export", heading("Export"));
        await screen(page, failures, "export refused", "/settings/export?error=wait", async () => {
          await expect(page.getByRole("alert").filter({ hasText: "once a minute" })).toBeVisible();
        });
        await screen(page, failures, "invite-only", "/invite-only", heading("CoreEx is invite-only"));
        await screen(page, failures, "disabled", "/disabled", heading("Your account is disabled"));
        await screen(page, failures, "reset password", "/reset-password", heading("Choose a new password"));
        await screen(page, failures, "404", "/notes/00000000-0000-0000-0000-000000000000", heading("Page not found"));

        // Open states: the palette, empty and typed.
        await page.goto("/items");
        await heading("All Items")();
        const palette = await openPalette(page);
        await scan(page, failures, "palette empty");
        await page.keyboard.type(word);
        await expect(palette.getByRole("option", { name: noteA, exact: true })).toBeVisible();
        await scan(page, failures, "palette typed");
        await page.keyboard.press("Escape");

        // The Upload dialog with a file listed (the file is trashed again right away), and the drop overlay.
        await page.getByRole("button", { name: "Upload", exact: true }).first().click();
        const upload = page.getByRole("dialog", { name: "Upload files" });
        await scan(page, failures, "upload dialog");
        const extra = `matrix-extra-${word}.png`;
        await upload.getByLabel("Choose files").setInputFiles({ name: extra, mimeType: "image/png", buffer: PIXEL });
        await expect(upload.getByRole("link", { name: extra })).toBeVisible();
        await scan(page, failures, "upload dialog with a file");
        await upload.getByRole("link", { name: extra }).click();
        await page.getByRole("button", { name: "Move to Trash" }).click();
        await expect(page).toHaveURL(/\/items$/);
        // The page's title arrives a moment after the address changes; axe fails a page without one.
        await expect(page).toHaveTitle(/.+/);
        await page.dispatchEvent("main", "dragenter", {
          dataTransfer: await page.evaluateHandle(() => {
            const data = new DataTransfer();
            data.items.add(new File(["x"], "x.md", { type: "text/markdown" }));
            return data;
          }),
        });
        await expect(page.getByText("Drop to add to the top level")).toBeVisible();
        await scan(page, failures, "drop overlay");

        // The Item row menu, its right-click menu, and the two dialogs it opens.
        await page.goto("/items");
        const menu = page.getByRole("button", { name: `Actions for ${noteA}` });
        await menu.click();
        await scan(page, failures, "row menu");
        await page.getByRole("menuitem", { name: "Move to Folder…" }).click();
        await scan(page, failures, "move dialog");
        await page.keyboard.press("Escape");
        await menu.click();
        await page.getByRole("menuitem", { name: "Add Tag…" }).click();
        await scan(page, failures, "add tag dialog");
        await page.keyboard.press("Escape");
        if (!phone) {
          await page.getByRole("row").filter({ hasText: noteA }).click({ button: "right" });
          await scan(page, failures, "context menu");
          await page.keyboard.press("Escape");
        }

        // The Note: the "+ Tag" popover, the Details (a Sheet on a phone), and the Link preview.
        await page.goto(seed.note);
        await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(noteA);
        // The Tags sit under the title; on a phone the Details are a Sheet.
        await page.getByRole("button", { name: "Tag", exact: true }).click();
        await scan(page, failures, "+ Tag popover");
        await page.keyboard.press("Escape");
        if (phone) {
          // A click before React has hydrated the page is lost, so click again until the Sheet shows.
          const sheet = page.getByRole("dialog", { name: "Details" });
          await expect(async () => {
            if (!(await sheet.isVisible())) await page.getByRole("button", { name: "Details" }).click();
            await expect(sheet).toBeVisible({ timeout: 1500 });
          }).toPass();
          await scan(page, failures, "details sheet");
        }
        // History, opened in the Details panel (the Sheet on a phone): the Note has the version its first edit kept.
        await page.getByRole("button", { name: "History" }).click();
        await page.getByRole("button", { name: /^Preview the text from/ }).first().click();
        await expect(page.locator("pre[aria-label^='Text from']").first()).toBeVisible();
        await scan(page, failures, "history open");
        if (phone) await page.keyboard.press("Escape");
        await page.goto(`/search?q=${word}`);
        await page.getByRole("listitem").filter({ hasText: noteB }).getByRole("link", { name: noteB }).click();
        const link = page.locator(".cm-wikilink", { hasText: noteA });
        await link.hover();
        await expect(page.locator("[data-link-preview]").filter({ hasText: noteA })).toBeVisible();
        await scan(page, failures, "link preview");

        // Tags: the colour popover and the delete confirm.
        await page.goto("/tags");
        await page.getByRole("button", { name: `Colour of ${tagName}` }).click();
        await scan(page, failures, "tag colour popover");
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: `Delete ${tagName}` }).click();
        await scan(page, failures, "delete tag confirm");
        await page.keyboard.press("Escape");

        // Trash: Delete forever and Empty Trash. Admin: the Revoke confirm.
        await page.goto("/trash");
        await page.getByRole("button", { name: `Delete forever: ${trashed}` }).click();
        await scan(page, failures, "delete forever confirm");
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Empty Trash" }).click();
        await scan(page, failures, "empty trash confirm");
        await page.keyboard.press("Escape");
        await page.goto("/admin");
        await page.getByRole("row").filter({ hasText: invited }).getByRole("button", { name: /^Revoke/ }).click();
        await scan(page, failures, "revoke confirm");
        await page.keyboard.press("Escape");

        // The Folder's own actions.
        await page.goto(seed.folder);
        await page.getByRole("button", { name: `Rename ${folderName}` }).click();
        await scan(page, failures, "rename folder dialog");
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: `Move ${folderName} to Trash` }).click();
        await scan(page, failures, "trash folder confirm");
        await page.keyboard.press("Escape");

        // The shell: the phone menu, or the tablet's Knowledge Base panel.
        await page.goto("/items");
        if (phone) {
          await page.getByRole("button", { name: "Open the menu" }).click();
          await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
          await scan(page, failures, "phone menu");
        } else {
          await page.setViewportSize({ width: 1024, height: 768 });
          await page.getByRole("button", { name: "Show the Knowledge Base panel" }).click();
          await expect(page.getByRole("dialog", { name: "Knowledge Base" })).toBeVisible();
          await scan(page, failures, "tablet panel");
          await page.keyboard.press("Escape");
          await page.goto("/career/applications");
          await page.getByRole("button", { name: "Show the Career panel" }).click();
          await expect(page.getByRole("dialog", { name: "Career" })).toBeVisible();
          await scan(page, failures, "tablet career panel");
        }

        await context.close();
        expect(failures).toEqual([]);
      });
    });
  }
}
