import { defineConfig } from "vitest/config";

// Plain logic only (no DOM): the helpers that must agree with the Java side or that are easy to get subtly wrong.
export default defineConfig({
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
});
