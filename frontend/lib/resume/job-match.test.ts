import { describe, expect, it } from "vitest";
import { jobMatch } from "./job-match";

describe("job keywords", () => {
  it("matches stems and aliases without matching unrelated words", () => {
    const matches = jobMatch("Developing JavaScript and PostgreSQL applications", "Developed JS and Postgres services", []);
    expect(matches.find((m) => m.word === "developing")?.covered).toBe(true);
    expect(matches.find((m) => m.word === "javascript")?.covered).toBe(true);
    expect(matches.find((m) => m.word === "postgresql")?.covered).toBe(true);
    expect(matches.find((m) => m.word === "applications")?.covered).toBe(false);
  });
  it("marks keywords that are not true for the user", () => {
    expect(jobMatch("Kubernetes", "", ["kubernet"])[0].excluded).toBe(true);
    expect(jobMatch("Kubernetes", "", [])[0].excluded).toBe(false);
  });
});
