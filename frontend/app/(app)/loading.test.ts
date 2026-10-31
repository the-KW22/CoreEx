import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

// A click to another page only shows a skeleton if that page's own folder has a loading.tsx: one higher up is
// already on screen and does not show again (moving between two Notes, say). Home has its own Suspense.
describe("loading.tsx", () => {
  it("sits next to every page under app/(app)", () => {
    const root = import.meta.dirname;
    const missing = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => basename(file) === "page.tsx")
      .map(dirname)
      .filter((dir) => dir !== "." && !existsSync(join(root, dir, "loading.tsx")));
    expect(missing).toEqual([]);
  });
});
