import { defineConfig, devices } from "@playwright/test";

// Runs against the local stack you already started (Supabase, the API, `npm run dev`); see docs/DEVELOPMENT.md section 9.
export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
