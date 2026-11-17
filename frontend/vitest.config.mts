import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Plain logic only (no DOM): the helpers that must agree with the Java side or that are easy to get subtly wrong.
export default defineConfig({
  // The same "@/" alias as tsconfig.json, so tests import the app's modules the way the app does.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
});
