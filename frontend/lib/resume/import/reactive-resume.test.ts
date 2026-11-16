import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ImportError } from "./common";
import { reactiveResumeToResume } from "./reactive-resume";

const fixture = JSON.parse(readFileSync(new URL("./__fixtures__/reactive-resume.json", import.meta.url), "utf8"));

describe("Reactive Resume JSON", () => {
  it("maps the basics, summary and each section into its kind, with dates as start and end", () => {
    const { document } = reactiveResumeToResume(fixture);
    expect(document.basics).toMatchObject({
      name: "Grace Hopper",
      headline: "Rear Admiral",
      email: "grace@example.com",
      phone: "+1 555 0199",
      location: "Arlington, VA",
      website: "https://grace.example",
    });
    expect(document.basics.customFields).toEqual([{ label: "GitHub", value: "gracehopper" }]);
    expect(document.summary).toBe("<p>Pioneer of <strong>compilers</strong>.</p>");
    expect(document.sections.map((s) => [s.kind, s.entries.length])).toEqual([
      ["EXPERIENCE", 2],
      ["EDUCATION", 1],
      ["PROJECTS", 1],
      ["SKILLS", 1],
      ["LANGUAGES", 1],
      ["CERTIFICATIONS", 1],
    ]);
  });

  it("dates read from the structured dates, an open end is present, and a hidden item stays hidden", () => {
    const { document } = reactiveResumeToResume(fixture);
    const [navy, eckert] = document.sections[0].entries;
    expect([navy.title, navy.subtitle, navy.location, navy.startDate, navy.endDate]).toEqual([
      "Programmer",
      "US Navy",
      "Washington",
      "1944",
      "1966",
    ]);
    expect([eckert.startDate, eckert.endDate, eckert.hidden]).toEqual(["1967", "present", true]);
    expect(document.sections[1].entries[0]).toMatchObject({ title: "BA Mathematics", subtitle: "Vassar College", startDate: "1924", endDate: "1928" });
    expect(document.sections[2].entries[0]).toMatchObject({ title: "COBOL", startDate: "1959", endDate: "1960" });
    expect(document.sections[3].entries[0]).toMatchObject({ title: "Programming", level: "Expert", keywords: ["COBOL", "FORTRAN"] });
    expect(document.sections[4].entries[0]).toMatchObject({ title: "English", level: "Native" });
    expect(document.sections[5].entries[0]).toMatchObject({ title: "Naval Reserve Certificate", subtitle: "US Navy", startDate: "1943" });
  });

  it("a custom section is skipped and named in the review", () => {
    const { skipped } = reactiveResumeToResume(fixture);
    expect(skipped).toEqual(['Custom section "Hobbies" (not imported).']);
  });

  it("reads a period text when there are no structured dates", () => {
    const { document } = reactiveResumeToResume({
      basics: { name: "A" },
      sections: { experience: { items: [{ company: "Acme", position: "Engineer", period: "Mar 2021 - Present" }] } },
    });
    expect(document.sections[0].entries[0]).toMatchObject({ startDate: "2021-03", endDate: "present" });
  });

  it("a file whose sections are not a Reactive Resume is refused with a clear message", () => {
    expect(() => reactiveResumeToResume({ basics: {}, sections: { experience: { items: "nope" } } })).toThrow(ImportError);
    expect(() => reactiveResumeToResume({ basics: {}, sections: { experience: { items: "nope" } } })).toThrow(/Reactive Resume/);
  });
});
