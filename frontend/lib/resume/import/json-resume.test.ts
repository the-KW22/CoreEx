import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ImportError } from "./common";
import { jsonResumeToResume } from "./json-resume";

const fixture = JSON.parse(readFileSync(new URL("./__fixtures__/json-resume.json", import.meta.url), "utf8"));

describe("JSON Resume", () => {
  it("maps basics, profiles and the summary, escaping text that is not HTML", () => {
    const { document } = jsonResumeToResume(fixture);
    expect(document.basics).toMatchObject({ name: "Linus Torvalds", headline: "Programmer", website: "https://linus.example", location: "Portland, OR" });
    expect(document.summary).toBe("<p>Writes kernels &amp; &lt;b&gt;tools&lt;/b&gt;.</p>");
    expect(document.sections.find((s) => s.kind === "PROFILES")?.entries[0]).toMatchObject({
      title: "GitHub",
      subtitle: "torvalds",
      url: "https://github.example/torvalds",
    });
  });

  it("maps work, education, skills, languages and projects into their sections with dates", () => {
    const { document } = jsonResumeToResume(fixture);
    const byKind = Object.fromEntries(document.sections.map((s) => [s.kind, s.entries]));
    expect(byKind.EXPERIENCE[0]).toMatchObject({ title: "Maintainer", subtitle: "Linux Foundation", startDate: "1991-08", endDate: "present" });
    expect(byKind.EXPERIENCE[0].description).toBe("<p>Maintains &lt;the&gt; kernel</p><ul><li>Merged patches</li></ul>");
    expect(byKind.EDUCATION[0]).toMatchObject({ title: "MSc Computer Science", subtitle: "University of Helsinki", startDate: "1988", endDate: "1996" });
    expect(byKind.SKILLS[0]).toMatchObject({ title: "C", level: "Expert", keywords: ["Kernel", "Git"] });
    expect(byKind.LANGUAGES[0]).toMatchObject({ title: "Finnish", level: "Native speaker" });
    expect(byKind.PROJECTS[0]).toMatchObject({ title: "Git", startDate: "2005-04-07", endDate: "" });
  });

  it("a file whose work is not a list is refused with a clear message", () => {
    expect(() => jsonResumeToResume({ basics: { name: "x" }, work: "nope" })).toThrow(ImportError);
    expect(() => jsonResumeToResume({ basics: { name: "x" }, work: "nope" })).toThrow(/JSON Resume/);
  });
});
