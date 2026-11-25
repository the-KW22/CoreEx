import { expect, test } from "@playwright/test";

import { expectNoViolations, signIn } from "./helpers";

// An Admin turns Access requests into Invites (docs/DESIGN.md 6.7 and 6.15). The requests are made straight at the
// API, each from its own made-up address, so the per-address limit never gets in the way.
const API = process.env.API_URL ?? "http://localhost:8080";

test("an Admin invites one Access request and dismisses another", async ({ page, request }) => {
  const stamp = Date.now();
  const invited = `ask-invite-${stamp}@example.com`;
  const dismissed = `ask-dismiss-${stamp}@example.com`;
  for (const [i, email] of [invited, dismissed].entries()) {
    const sent = await request.post(`${API}/api/access-requests`, { data: { email }, headers: { "X-Visitor-IP": `198.51.100.${(stamp + i) % 250}` } });
    expect(sent.status()).toBe(202);
  }

  await signIn(page);
  await page.goto("/admin");
  const section = page.getByRole("region", { name: /Access requests/ });
  await expect(section.getByRole("row").filter({ hasText: invited })).toBeVisible();
  await expectNoViolations(page);

  await section.getByRole("button", { name: `Invite ${invited}` }).click();
  await expect(section.getByRole("row").filter({ hasText: invited })).toHaveCount(0);
  // The Invite is in the Invites list as Pending.
  await expect(page.getByRole("row").filter({ hasText: invited }).filter({ hasText: "Pending" })).toBeVisible();

  await section.getByRole("button", { name: `Dismiss the request from ${dismissed}` }).click();
  await expect(page.getByRole("row").filter({ hasText: dismissed })).toHaveCount(0);

  // Tidy up: revoke the Invite we made.
  await page.getByRole("button", { name: `Revoke the Invite for ${invited}` }).click();
  await page.getByRole("button", { name: "Revoke", exact: true }).last().click();
  await expect(page.getByRole("row").filter({ hasText: invited }).filter({ hasText: "Revoked" })).toBeVisible();
});
