import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ImportError } from "./common";
import { coreExToResume } from "./coreex";
import { SAMPLE } from "../sample";

const fixture = JSON.parse(readFileSync(new URL("./__fixtures__/coreex.json", import.meta.url), "utf8"));

describe("CoreEx JSON", () => {
  it("reads sections, entries and dates as they were exported", () => {
    const { document } = coreExToResume(fixture);
    expect(document.basics.name).toBe("Ada Lovelace");
    expect(document.summary).toBe("<p>Built <strong>engines</strong>.</p>");
    expect(document.sections.map((s) => [s.kind, s.entries.length])).toEqual([
      ["EXPERIENCE", 1],
      ["EDUCATION", 1],
    ]);
    const job = document.sections[0].entries[0];
    expect([job.title, job.subtitle, job.startDate, job.endDate]).toEqual(["Analyst", "Babbage Ltd", "2019-04", "present"]);
    expect(document.sections[1].entries[0]).toMatchObject({ title: "BSc Maths", startDate: "2010", endDate: "2013" });
  });

  it("an export of a Resume reads back as the same Resume", () => {
    expect(coreExToResume(JSON.parse(JSON.stringify(SAMPLE))).document).toEqual(SAMPLE);
  });

  it("a file with an unknown section kind is refused with a clear message", () => {
    const broken = { basics: {}, sections: [{ kind: "NOPE", title: "x", entries: [] }] };
    expect(() => coreExToResume(broken)).toThrow(ImportError);
    expect(() => coreExToResume(broken)).toThrow(/unknown kind/);
  });

  it("a photo from another account is not carried over", () => {
    const withPhoto = structuredClone(fixture);
    withPhoto.basics.photo.assetId = "0a1b2c3d-0000-4000-8000-000000000001";
    const { document, skipped } = coreExToResume(withPhoto);
    expect(document.basics.photo.assetId).toBe("");
    expect(skipped).toEqual(["Photo: its Asset belongs to the account that exported it, so it is not imported."]);
  });
});
