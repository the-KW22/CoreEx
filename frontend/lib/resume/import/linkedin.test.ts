import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ImportError } from "./common";
import { linkedInToResume } from "./linkedin";

const dir = new URL("./__fixtures__/linkedin/", import.meta.url);
const files = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));

describe("LinkedIn export", () => {
  it("reads the profile: name, headline, location and a summary with its line breaks", () => {
    const { document } = linkedInToResume(files);
    expect(document.basics).toMatchObject({ name: "Margaret Hamilton", headline: "Software engineer, Apollo", location: "Cambridge MA" });
    expect(document.summary).toBe("<p>Led the team,<br>which wrote Apollo guidance code.</p>");
  });

  it("maps positions, education, skills, languages, projects and certifications into their sections", () => {
    const { document } = linkedInToResume(files);
    const byKind = Object.fromEntries(document.sections.map((s) => [s.kind, s.entries]));
    expect(byKind.EXPERIENCE).toMatchObject([
      { title: "Director", subtitle: "Draper Labs", startDate: "1965-03", endDate: "present", description: "<p>Ran the software group</p>" },
      { title: "Lead Engineer", subtitle: "Apollo Program", location: "Houston", startDate: "1967-01", endDate: "1972-12" },
    ]);
    expect(byKind.EDUCATION[0]).toMatchObject({ title: "BA Mathematics", subtitle: "Hunter College", startDate: "1958", endDate: "1961" });
    expect(byKind.SKILLS.map((e) => e.title)).toEqual(["Software Engineering", "Systems Design"]);
    expect(byKind.LANGUAGES[0]).toMatchObject({ title: "English", level: "Native or bilingual proficiency" });
    expect(byKind.PROJECTS[0]).toMatchObject({ title: "Guidance", url: "https://example.com/guidance", startDate: "1966-01", endDate: "1969-07" });
    expect(byKind.CERTIFICATIONS[0]).toMatchObject({ title: "Apollo Operator Certificate", subtitle: "NASA", startDate: "1968-06", endDate: "" });
  });

  it("a quoted field may hold a comma and a line break", () => {
    const { document } = linkedInToResume({ "Profile.csv": 'First Name,Last Name,Headline\nA,B,"x, ""y""\nz"\n' });
    expect(document.basics.headline).toBe('x, "y"\nz');
  });

  it("a zip with no LinkedIn files, or a CSV that does not parse, is refused with a clear message", () => {
    expect(() => linkedInToResume({ "notes.csv": "a,b\n1,2" })).toThrow(ImportError);
    expect(() => linkedInToResume({ "notes.csv": "a,b\n1,2" })).toThrow(/LinkedIn/);
    expect(() => linkedInToResume({ "Profile.csv": 'First Name\n"unclosed' })).toThrow(/profile\.csv is not a valid CSV/i);
  });
});
