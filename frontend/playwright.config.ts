import { defineConfig, devices } from "@playwright/test";

// Runs against the local stack you already started (Supabase and the API; see docs/DEVELOPMENT.md section 9).
// By default it builds the frontend and serves that build on port 3100, fresh every run: a production build has no
// compile-on-demand and no memory growth, which made the tests slow and flaky against `npm run dev`. Set
// E2E_BASE_URL to test an already running server instead (for example `npm run dev`).
const base = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  // A click or fill that cannot find its element fails after 15 s, rather than waiting until the whole test times out.
  use: { baseURL: base ?? "http://localhost:3100", trace: "retain-on-failure", actionTimeout: 15_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: base
    ? undefined
    : {
        // Its own build folder, so a running `npm run dev` is left alone.
        command: "npx next build && npx next start -p 3100",
        env: { E2E_BUILD: "1" },
        url: "http://localhost:3100/login",
        reuseExistingServer: false,
        timeout: 300_000,
      },
});
