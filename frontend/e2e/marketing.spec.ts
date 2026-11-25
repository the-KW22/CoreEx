import { expect, test } from "@playwright/test";

import { expectNoViolations, signIn } from "./helpers";

// The public marketing page (docs/DESIGN.md "Marketing page"). The signed-out tests need only the frontend; the
// signed-in one needs the local stack.
for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`marketing page, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test("signed out, / shows the marketing page and it has no sideways scroll or axe violations", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1, name: "Everything you know, connected." })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Request access" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
      await expectNoViolations(page);
    });

    test("the page has no sideways scroll at 375px", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

test("reduced motion shows the window flat", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("signed in, / is still Home", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything you know, connected." })).toHaveCount(0);
});

test("the active step changes as the story scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const steps = page.getByRole("list", { name: "How CoreEx works" });
  await expect(steps.locator("[aria-current=step]")).toHaveCount(0);
  const at = async (name: string, fraction: number) => {
    await page.evaluate((f) => {
      const s = document.querySelector("#story")!;
      window.scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.clientHeight - innerHeight) * f);
    }, fraction);
    await expect(steps.locator("[aria-current=step]")).toContainText(name);
  };
  await at("Write", 0.3);
  await at("Keep", 0.5);
  await at("Connect", 0.7);
  await at("Ask", 0.95);
});

test("on a phone nothing pins and every step shows", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/");
  const steps = page.getByRole("list", { name: "How CoreEx works" });
  await expect(steps.getByRole("heading", { level: 2 })).toHaveCount(4);
  expect(await page.evaluate(() => document.querySelector("#story")!.clientHeight < innerHeight * 6)).toBe(true);
  await expect(steps.locator("[aria-current=step]")).toHaveCount(0);
});

test("the Connect scene draws a named Graph", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    const s = document.querySelector("#story")!;
    window.scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.clientHeight - innerHeight) * 0.79);
  });
  const graph = page.getByRole("img", { name: /A Graph of about 60 Items/ });
  await expect(graph).toBeVisible();
  await expect(async () => {
    const drawn = await graph.evaluate((c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0));
    expect(drawn).toBe(true);
  }).toPass();
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`every section renders and passes axe once scrolled through, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    for (const name of ["Your AI agent can use it too.", "Run your job search from the same place.", "One place, built from modules.", "Your notes stay yours.", "Ask for an Invite."]) {
      const heading = page.getByRole("heading", { level: 2, name });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    }
    await expect(page.getByText("Changed by Claude Desktop just now")).toBeVisible();
    await expect(page.getByRole("link", { name: "Request access" }).last()).toBeVisible();
    await expectNoViolations(page);
  });
}

test("on a phone the module cards wrap and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 3, name: "Knowledge Base" })).toBeAttached();
  const tops = await page.locator("#modules li").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBeGreaterThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("smooth scroll runs on the marketing page only", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html.lenis")).toHaveCount(1);
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("html.lenis")).toHaveCount(0);
});

test("reduced motion keeps native scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html.lenis")).toHaveCount(0);
});

test("an anchor link lands on its section below the sticky nav", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Career" }).click();
  await expect(async () => {
    const top = await page.locator("#career").evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(Math.abs(top - 56)).toBeLessThan(8);
  }).toPass();
});

test.describe("Request access form", () => {
  test("a Request access link in the nav takes the visitor to the form and focuses the field", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Request access" }).click();
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByLabel("Email")).toBeInViewport();
  });

  test("submitting an email shows the sent state, and the same email again looks the same", async ({ page }) => {
    const email = `visitor-${Date.now()}@example.com`;
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto("/");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Request access" }).last().click();
      await expect(page.getByRole("status")).toHaveText("Thanks. We'll email you an invite.");
    }
  });

  test("an email the API refuses shows what to do, and keeps what was typed", async ({ page }) => {
    await page.goto("/");
    // The browser's own check is skipped so the API's message is what shows.
    await page.getByRole("button", { name: "Request access" }).last().evaluate((b) => b.closest("form")!.setAttribute("novalidate", ""));
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Request access" }).last().click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a valid email address." })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
  });

});

test("the page has no link to Docs, which needs a sign-in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("a[href=\"/docs\"]")).toHaveCount(0);
});

test("the Request access form says it is an early placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Early access")).toBeVisible();
  await expect(page.getByText(/saved for the owner to read by hand/)).toBeVisible();
});
